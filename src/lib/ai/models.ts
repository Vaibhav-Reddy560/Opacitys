import "server-only";
import { groq, createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import {
  generateText,
  streamText,
  Output,
  APICallError,
  RetryError,
  NoObjectGeneratedError,
  type ModelMessage,
  type FlexibleSchema,
  type ToolSet,
} from "ai";

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

// Groq's free tier is genuinely free but genuinely rate-limited — worth
// surfacing honestly to the caller rather than presenting a generic 502.
//
// There are two *different* limits behind the same 429, and conflating them
// gives the user actively wrong advice:
//   - per-minute (TPM ~8k, RPM): transient. Waiting a second or two fixes it.
//   - per-day (TPD 200k, RPD 1k): not transient at all. Measured live — one
//     browser-search research pass consumed ~199.5k of the 200k daily token
//     allowance, and the API's own reply was "try again in 22m31s". Retrying
//     that after 1500ms is guaranteed to fail, and telling the user to "wait
//     a moment" is a lie.
// So `scope` decides both whether we retry and what we say.
export type RateLimitScope = "minute" | "day";

export class GroqRateLimitError extends Error {
  readonly scope: RateLimitScope;
  /** Seconds until the limit resets, when Groq told us. */
  readonly retryAfterSeconds: number | null;

  constructor(scope: RateLimitScope = "minute", retryAfterSeconds: number | null = null) {
    super(
      scope === "day"
        ? `Today's free-tier request budget on Groq is used up${formatWait(retryAfterSeconds)}.`
        : `Groq's per-minute rate limit was hit${formatWait(retryAfterSeconds) || " — wait a moment"} and try again.`,
    );
    this.name = "GroqRateLimitError";
    this.scope = scope;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function formatWait(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 90) return ` — try again in about ${Math.max(1, Math.round(seconds))}s`;
  return ` — try again in about ${Math.round(seconds / 60)} minutes`;
}

/**
 * Groq states the window in prose rather than a machine-readable field:
 *   "...on tokens per day (TPD): Limit 200000, Used 199505, Requested 3624.
 *    Please try again in 22m31.727999999s."
 * so this reads the phrase. Anything it can't classify is treated as
 * per-minute, which is the safe default: it retries once and recovers, where
 * mislabelling a per-minute blip as a daily cap would tell the user to come
 * back tomorrow over a two-second problem.
 */
function parseRateLimit(err: unknown): { scope: RateLimitScope; retryAfterSeconds: number | null } {
  // Defense in depth: every call site below passes `maxRetries: 0` so the
  // real APICallError should always reach here directly, but if any call
  // site is ever added without it, the SDK wraps a retried-out 429 as
  // RetryError(.lastError: APICallError) instead — unwrap that case too
  // rather than silently mis-scoping it as "minute".
  const unwrapped = RetryError.isInstance(err) ? err.lastError : err;
  const body = APICallError.isInstance(unwrapped) ? (unwrapped.responseBody ?? "") : "";
  const text = `${body} ${unwrapped instanceof Error ? unwrapped.message : ""}`;

  const scope: RateLimitScope = /per\s*day|\(TPD\)|\(RPD\)/i.test(text) ? "day" : "minute";

  // "22m31.727999999s" | "1m26.4s" | "2.5s" | "547ms"
  let retryAfterSeconds: number | null = null;
  const m = /try again in\s+(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?/i.exec(text);
  if (m && (m[1] || m[2] || m[3] || m[4])) {
    retryAfterSeconds =
      Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 1000;
  }

  return { scope, retryAfterSeconds };
}

function isRateLimit(err: unknown): boolean {
  const unwrapped = RetryError.isInstance(err) ? err.lastError : err;
  return APICallError.isInstance(unwrapped) && unwrapped.statusCode === 429;
}

// Every generateText/streamText call below passes `maxRetries: 0`. The `ai`
// SDK retries 429s itself by default (2 retries = 3 attempts,
// node_modules/ai/dist/index.d.ts:4665) — confirmed live: a genuine daily-cap
// 429 came back wrapped as `AI_RetryError` (with `.errors`/`.lastError`), not
// the plain `APICallError` this file's classifier expects, so
// `withRateLimitRetry` never even saw it as a rate limit and the honest
// day-vs-minute message below never fired. Disabling the SDK's own retry
// makes `withRateLimitRetry` the single retry authority, so the classifier
// always sees the real `APICallError`.
async function withRateLimitRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isRateLimit(err)) {
      const { scope, retryAfterSeconds } = parseRateLimit(err);
      // A daily cap will still be a daily cap in 1500ms — fail straight
      // through with the real reset time instead of burning a retry.
      if (scope === "minute" && retries > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return withRateLimitRetry(fn, retries - 1);
      }
      throw new GroqRateLimitError(scope, retryAfterSeconds);
    }
    throw err;
  }
}

// Exported only so the rate-limit classifier can be tested against real
// captured 429 bodies without making a live call.
export const __parseRateLimitForTest = parseRateLimit;

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
      maxRetries: 0, // see the note above withRateLimitRetry
      providerOptions: groqProviderOptions(params.model, false),
    });
    return { text, usage };
  });
}

// ---------------------------------------------------------------------------
// Web-grounded research (Groq browser search)
// ---------------------------------------------------------------------------

/** A page the model actually searched up or opened — never one it named from memory. */
export interface ResearchSource {
  title: string;
  url: string;
}

// Groq returns what its browser tool did under `executed_tools`, which
// @ai-sdk/groq DOES NOT PARSE — its response schema (dist/index.js:679)
// drops the field entirely. The raw JSON is still reachable as
// `response.body` (dist/index.js:476 sets `rawValue: rawResponse`), so the
// citations are recoverable, just by hand.
//
// Shapes confirmed against a real 24-tool response: every entry has a
// `search_results` object, but `results` inside it is null on 7 of them
// (the browser.open turns that didn't re-list links). Hence nullish
// everywhere and `.catch(...)` on the whole thing — a citation list is worth
// having, never worth failing a completed research pass over.
const executedToolsSchema = z
  .object({
    choices: z
      .array(
        z.object({
          message: z
            .object({
              executed_tools: z
                .array(
                  z.object({
                    search_results: z
                      .object({
                        results: z
                          .array(
                            z.object({ title: z.string().nullish(), url: z.string().nullish() }),
                          )
                          .nullish(),
                      })
                      .nullish(),
                  }),
                )
                .nullish(),
            })
            .nullish(),
        }),
      )
      .nullish(),
  })
  .catch({ choices: [] });

// browser.open re-lists the page it just read with a synthetic title like
// "blog.example.com - viewing lines [0 - 411] of 411". That's a status line,
// not a headline — when the same URL also appeared in a real search result,
// the real title wins.
const PLACEHOLDER_TITLE = /\bviewing lines \[\d+\s*-\s*\d+\]/i;
// The search backend's own results page. It's a query URL, not a source, and
// citing it would tell the designer nothing about who made the claim.
const AGGREGATOR = /^https?:\/\/(www\.)?exa\.ai\/search/i;

function extractSources(rawBody: unknown): ResearchSource[] {
  const parsed = executedToolsSchema.parse(rawBody);
  const byUrl = new Map<string, string>();

  for (const choice of parsed.choices ?? []) {
    for (const tool of choice.message?.executed_tools ?? []) {
      for (const r of tool.search_results?.results ?? []) {
        const url = r.url?.trim();
        if (!url || AGGREGATOR.test(url)) continue;
        const title = r.title?.trim() ?? "";
        const existing = byUrl.get(url);
        // First real title wins; a placeholder only fills an empty slot.
        if (existing === undefined || (PLACEHOLDER_TITLE.test(existing) && !PLACEHOLDER_TITLE.test(title))) {
          byUrl.set(url, title);
        }
      }
    }
  }

  return [...byUrl].map(([url, title]) => ({
    url,
    title: title && !PLACEHOLDER_TITLE.test(title) ? title : new URL(url).hostname.replace(/^www\./, ""),
  }));
}

// Groq's browser tool writes OpenAI-harmony citation markers inline —
// 【4†L101-L105】 — which index into a per-call result list the user never
// sees. Left in, they read as corruption; they're stripped here and replaced
// by the real URLs the caller resolves from `sources`.
const CITATION_MARKER = /【[^】]*】/g;

export function stripCitationMarkers(text: string): string {
  return text.replace(CITATION_MARKER, "").replace(/[ \t]+([.,;:)])/g, "$1");
}

/**
 * One web-grounded generation: the model searches and reads pages itself
 * (Groq executes the tool server-side, inside a single API call), and we get
 * back its prose plus the real pages it consulted.
 *
 * Only `openai/gpt-oss-20b` and `openai/gpt-oss-120b` support this. Passing
 * any other model doesn't error — @ai-sdk/groq silently drops the tool and
 * emits a warning — so the caller would get a confident, ungrounded answer
 * with no sources. That failure is silent and dangerous enough to be worth
 * throwing on here.
 *
 * NOTE: there is no way to cap how many searches/pages it runs. The tool
 * executes entirely inside Groq's turn, so the AI SDK never sees the loop and
 * `stopWhen`/`maxSteps` don't apply. The only levers are the prompt (soft)
 * and `maxOutputTokens` (hard, but only bounds the reply, not the browsing).
 * This matters: an unconstrained run was measured at 452k prompt tokens.
 */
const BROWSER_SEARCH_MODELS: Set<string> = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);

export async function generateResearched(params: {
  model: string;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
}): Promise<{ text: string; sources: ResearchSource[]; usage: { totalTokens?: number } }> {
  if (!BROWSER_SEARCH_MODELS.has(params.model)) {
    throw new Error(
      `${params.model} cannot run web research — Groq browser search is only available on ${[...BROWSER_SEARCH_MODELS].join(" or ")}.`,
    );
  }

  return withRateLimitRetry(async () => {
    // NOT `response.body` from generateText's result, despite that being the
    // documented way to reach a raw provider payload (dist/index.js:476 sets
    // `body: rawResponse` on the model's own doGenerate return, and zod
    // validation was independently confirmed to preserve executed_tools
    // through to that rawValue). Verified live, twice, with two different
    // models: the top-level `result.response.body` — and every per-step
    // `steps[].response.body` — comes back `undefined` by the time it
    // reaches generateText's returned result, even though the raw HTTP
    // payload for that exact call genuinely contains `executed_tools` (the
    // response text is captured independently below and does have it). That
    // gap is somewhere in `ai`@7's step/response plumbing between the
    // model-level result and the public API — not worth chasing through a
    // minified bundle to fix upstream. Instead, the raw HTTP response is
    // captured directly via a scoped provider instance's `fetch` override,
    // which makes source extraction depend on nothing but the wire payload.
    let capturedBody: unknown;
    const capturingFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (res.ok) {
        // Clone before reading — the original body must stay unconsumed for
        // the SDK's own parse of this same response.
        const text = await res.clone().text();
        try {
          capturedBody = JSON.parse(text);
        } catch {
          // Non-JSON body (shouldn't happen for this non-streaming call) —
          // extractSources tolerates an undefined capturedBody below.
        }
      }
      return res;
    };
    const scopedGroq = createGroq({ fetch: capturingFetch });

    const { text, usage } = await generateText({
      model: scopedGroq(params.model),
      system: params.system,
      messages: params.messages,
      maxOutputTokens: params.maxOutputTokens,
      maxRetries: 0, // see the note above withRateLimitRetry
      // Cast: @ai-sdk/groq@4.0.19's browserSearch() declares its (empty)
      // input schema as FlexibleSchema<{}>, but `ai`@7's ToolSet requires
      // FlexibleSchema<never> for a no-input provider tool — a real
      // upstream .d.ts mismatch between the two packages, not a logic
      // error here. Runtime is unaffected (verified live against the raw
      // Groq API: browser_search works and returns real results); this
      // only silences a structurally-impossible type error.
      tools: { browser_search: scopedGroq.tools.browserSearch({}) } as ToolSet,
      providerOptions: groqProviderOptions(params.model, false),
    });

    return {
      text: stripCitationMarkers(text),
      sources: extractSources(capturedBody),
      usage: { totalTokens: usage.totalTokens },
    };
  });
}

// Exported for fixture-driven tests against real captured Groq responses.
export const __extractSourcesForTest = extractSources;

export function streamGrounded(params: { model: string; system: string; messages: ModelMessage[] }) {
  return streamText({
    model: groq(params.model),
    system: params.system,
    messages: params.messages,
    maxRetries: 0, // see the note above withRateLimitRetry
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
      maxRetries: 0, // see the note above withRateLimitRetry
      output: Output.object({ schema: params.schema, name: params.schemaName }),
      providerOptions: groqProviderOptions(params.model, strict),
    });
    return { data: output, usage };
  };

  try {
    return await withRateLimitRetry(attempt);
  } catch (err) {
    if (err instanceof GroqRateLimitError) throw err;
    logIfNoObjectGenerated(params.model, err);
    // One retry for a malformed/non-conforming first attempt.
    try {
      return await withRateLimitRetry(attempt);
    } catch (retryErr) {
      logIfNoObjectGenerated(params.model, retryErr);
      throw retryErr;
    }
  }
}

// A schema mismatch here is otherwise a bare "response did not match
// schema" with no way to tell truncation (finishReason: "length" — raise
// maxOutputTokens) from a genuinely malformed response (a model that wandered
// off-format). Confirmed useful live: this is exactly the diagnostic that
// was missing when a Currents structuring call failed with no way to tell
// which case it was without re-running blind.
function logIfNoObjectGenerated(model: string, err: unknown): void {
  if (!NoObjectGeneratedError.isInstance(err)) return;
  console.error(
    `[generateJson] ${model} did not produce a schema-matching object — finishReason: ${err.finishReason}, text: ${(err.text ?? "").slice(0, 500)}`,
  );
}
