import "server-only";
import { generateText, streamText, type ModelMessage } from "ai";

// All Claude calls go through the Vercel AI Gateway using plain
// "provider/model" strings — never a provider-specific SDK — so gateway
// fallbacks/observability apply uniformly and swapping models is a string
// change, not a rewrite.
export const MODELS = {
  // Track B critique narration: needs strong vision + grounded reasoning.
  critique: "anthropic/claude-opus-5",
  // Cheaper synthesis: trend summaries, client-message translation.
  fast: "anthropic/claude-sonnet-5",
} as const;

export async function generateGrounded(params: {
  model: string;
  system: string;
  messages: ModelMessage[];
}) {
  const { text, usage } = await generateText({
    model: params.model,
    system: params.system,
    messages: params.messages,
  });
  return { text, usage };
}

export function streamGrounded(params: {
  model: string;
  system: string;
  messages: ModelMessage[];
}) {
  return streamText({
    model: params.model,
    system: params.system,
    messages: params.messages,
  });
}
