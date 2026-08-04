import "server-only";
import { groq } from "@ai-sdk/groq";
import { generateText, streamText, Output, APICallError, type ModelMessage, type FlexibleSchema } from "ai";

// All calls go through Groq, which serves open-source models (Llama, Qwen,
// GPT-OSS, Whisper) for free with no credit-card requirement at any tier.
//
// `meta-llama/llama-4-scout-17b-16e-instruct` (the model this used to point
// at for vision) has been decommissioned by Groq — verified live, it now
// 404s. `qwen/qwen3.6-27b` is the remaining vision-capable model on the
// platform as of this writing; it's a *reasoning* model (emits hidden
// <think> tokens) and only supports `json_object` response mode, not strict
// `json_schema`. `openai/gpt-oss-120b` is text-only but supports strict
// `json_schema` structured outputs, so it's used wherever a call needs a
// guaranteed shape and doesn't need to see an image.
export const MODELS = {
  /** Vision + reasoning — critique narration, Identify, image-grounded Originality reads. */
  vision: "qwen/qwen3.6-27b",
  /** Text-only, strict JSON-schema structured outputs — Originality's crowding read. */
  reasoning: "openai/gpt-oss-120b",
  /** Cheap text synthesis — Clearance/Instruments Q&A, client-message translation, voice cleanup. */
  fast: "llama-3.3-70b-versatile",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// Groq's free tier is genuinely free but genuinely rate-limited (~8-12k
// tokens/min depending on model, ~1k requests/day) — worth surfacing
// honestly to the caller rather than presenting a generic 502.
export class GroqRateLimitError extends Error {
  constructor(message = "Groq's free-tier rate limit was hit — wait a moment and try again.") {
    super(message);
    this.name = "GroqRateLimitError";
  }
}

function isRateLimit(err: unknown): boolean {
  return APICallError.isInstance(err) && err.statusCode === 429;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isRateLimit(err)) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return withRateLimitRetry(fn, retries - 1);
      }
      throw new GroqRateLimitError();
    }
    throw err;
  }
}

// Only qwen and gpt-oss are reasoning models — `reasoning_format` 400s if
// sent to llama-3.3-70b-versatile (verified live).
const REASONING_MODELS: Set<string> = new Set([MODELS.vision, MODELS.reasoning]);
// Only gpt-oss-120b supports strict `json_schema` structured outputs;
// everything else falls back to plain `json_object` mode (still valid
// JSON, just not provider-enforced against the schema — the zod parse
// below is the real guarantee either way).
const STRICT_SCHEMA_MODELS: Set<string> = new Set([MODELS.reasoning]);

// qwen is the only vision-capable model, which forces every image-grounded
// call (critique narration, Identify, image-grounded Originality) onto a
// *reasoning* model. Verified live: pairing that with anything beyond a
// short prompt — e.g. Identify's ~1500-token style taxonomy — makes qwen's
// hidden <think> trace alone exceed its 8k-tokens/minute free-tier ceiling,
// which either truncates the response before real JSON comes out
// ("Failed to generate JSON") or gets the request rejected outright
// ("Request too large"). qwen accepts only "none" or "default" for
// `reasoning_effort` (unlike gpt-oss's none/low/medium/high) — "none"
// verified to still produce well-grounded, evidence-citing output on a
// real classification prompt, at a fraction of the tokens, so it's used
// for every qwen call rather than only the one that happened to overflow.
function groqProviderOptions(model: string, strict: boolean) {
  const reasoning = REASONING_MODELS.has(model)
    ? { reasoningFormat: "hidden" as const, ...(model === MODELS.vision ? { reasoningEffort: "none" as const } : {}) }
    : {};
  return { groq: { structuredOutputs: strict, ...reasoning } };
}

export async function generateGrounded(params: {
  model: string;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
}) {
  return withRateLimitRetry(async () => {
    const { text, usage } = await generateText({
      model: groq(params.model),
      system: params.system,
      messages: params.messages,
      maxOutputTokens: params.maxOutputTokens,
      providerOptions: groqProviderOptions(params.model, false),
    });
    return { text, usage };
  });
}

export function streamGrounded(params: { model: string; system: string; messages: ModelMessage[] }) {
  return streamText({
    model: groq(params.model),
    system: params.system,
    messages: params.messages,
    providerOptions: groqProviderOptions(params.model, false),
  });
}

/**
 * Structured JSON generation with the right mode picked per model
 * capability (see STRICT_SCHEMA_MODELS above), zod-validated on the way
 * out, and one retry on either a rate limit or a malformed first attempt
 * (reasoning models occasionally wander outside the schema on try one —
 * cheap and fast enough on Groq that a retry is the simple fix).
 */
export async function generateJson<T>(params: {
  model: string;
  schema: FlexibleSchema<T>;
  schemaName?: string;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
}): Promise<{ data: T; usage: { inputTokens?: number; outputTokens?: number } }> {
  const attempt = async () => {
    const strict = STRICT_SCHEMA_MODELS.has(params.model);
    const { output, usage } = await generateText({
      model: groq(params.model),
      system: params.system,
      messages: params.messages,
      maxOutputTokens: params.maxOutputTokens ?? 2000,
      output: Output.object({ schema: params.schema, name: params.schemaName }),
      providerOptions: groqProviderOptions(params.model, strict),
    });
    return { data: output, usage };
  };

  try {
    return await withRateLimitRetry(attempt);
  } catch (err) {
    if (err instanceof GroqRateLimitError) throw err;
    // One retry for a malformed/non-conforming first attempt.
    return await withRateLimitRetry(attempt);
  }
}
