import "server-only";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { generateJson, MODELS } from "@/lib/ai/models";
import { routePlanSchema, type RoutePlan } from "./plan";

/**
 * Route's follow-up — the first real multi-turn conversation in this app.
 * Every other AI call in the codebase (`grep -rn 'role: "assistant"' src`
 * returns zero hits) flattens all context into one user message; this
 * builds an actual `role`-tagged history for generateJson's `messages`
 * array, which the helper already accepted but nothing used.
 */

export const routeReplySchema = z.object({
  reply: z.string(),
  // Non-null ONLY when the question exposed something genuinely wrong with
  // the plan, or changed a stated constraint — not for an ordinary
  // clarifying question. When set, this is the FULL corrected plan (same
  // shape as the original), not a diff.
  revisedPlan: routePlanSchema.nullable(),
  changeSummary: z.string().nullable(),
});
export type RouteReply = z.infer<typeof routeReplySchema>;

export interface TurnRecord {
  role: "user" | "assistant";
  content: string;
}

// Both caps exist for the same reason: history grows every turn, on a
// model that shares Currents' already-strained daily budget
// (src/lib/ai/models.ts's GroqRateLimitError). Unbounded growth here is
// exactly the shape of bug documented for other upstream-computed-list
// prompts in this app — the count, not just each entry's length, needs an
// explicit ceiling.
const MAX_HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 1200;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const TURN_SYSTEM = `You are continuing a conversation about a work plan you already gave a graphic designer. You can see the brief, their resources, the current plan, and the conversation so far.

Rules:
- Answer the actual question. If it's asking for clarity, explain — do not touch the plan.
- Write "reply" in PLAIN PROSE. This is displayed exactly as you write it, with no markdown rendering — so no **bold**, no "-" or "*" bullets, no numbered-list markers, no # headers, no → arrows. Any of those characters shows up literally on screen and is unreadable. If the question genuinely needs a sequence ("which tools, in what order"), write it as real sentences — "Start in Figma's Auto Layout panel to build the grid. Then switch to Illustrator's Pen tool to..." — not a formatted list.
- Be specific, not exhaustive: name the exact tool, panel, menu, or setting and the real value to use — not "adjust as needed" or a vague gesture at the tool. Say each thing once. Do not restate the plan or add a closing recap of what you just said.
- Set "revisedPlan" ONLY when the designer has pointed out something genuinely wrong (a step that doesn't work, a tool they don't actually have, a constraint you got wrong) or a real change (a new deadline, a dropped requirement). An ordinary "why did you pick this" or "explain step 2" question is NOT a reason to revise — leave "revisedPlan" null.
- When you DO revise, "revisedPlan" is the FULL corrected plan in the exact same shape as the original (reading/approaches/chosen/steps/totalHours/gaps/assumptions) — not a partial patch. "changeSummary" names what changed in one sentence, e.g. "Step 3 moved from Illustrator to Figma — you said you don't have Illustrator."
- If the designer is simply wrong about something (the plan already accounts for what they're raising), say so plainly in "reply" and leave "revisedPlan" null — do not revise just to seem agreeable.
- Never invent details the brief and conversation don't support.

Return ONLY valid JSON in exactly this shape, every key present:
{"reply":"...","revisedPlan":null,"changeSummary":null}`;

function planContextBlock(params: {
  brief: string;
  deadline: string | null;
  tools: string[];
  skillLevel: string | null;
  plan: RoutePlan;
}): string {
  const resourceLines = [
    params.deadline && `Deadline: ${params.deadline}`,
    `Tools: ${params.tools.length > 0 ? params.tools.join(", ") : "none stated"}`,
    `Skill level: ${params.skillLevel ?? "not stated"}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Brief:\n${params.brief}\n\n${resourceLines}\n\nCurrent plan:\n${JSON.stringify(params.plan)}`;
}

/**
 * Builds the message array for one follow-up call: the plan context once,
 * then the last MAX_HISTORY_TURNS prior turns as real role-tagged messages,
 * then the new question. `history` must already be in chronological order
 * and must NOT include the new question itself.
 */
export function buildTurnMessages(params: {
  brief: string;
  deadline: string | null;
  tools: string[];
  skillLevel: string | null;
  plan: RoutePlan;
  history: TurnRecord[];
  question: string;
}): ModelMessage[] {
  const recentHistory = params.history.slice(-MAX_HISTORY_TURNS);

  const messages: ModelMessage[] = [
    { role: "user", content: planContextBlock(params) },
  ];

  for (const turn of recentHistory) {
    messages.push({ role: turn.role, content: truncate(turn.content, MAX_TURN_CHARS) });
  }

  messages.push({ role: "user", content: params.question });
  return messages;
}

export async function generateReply(params: {
  brief: string;
  deadline: string | null;
  tools: string[];
  skillLevel: string | null;
  plan: RoutePlan;
  history: TurnRecord[];
  question: string;
}): Promise<{ reply: RouteReply; tokensUsed: number }> {
  const messages = buildTurnMessages(params);

  const { data, usage } = await generateJson({
    model: MODELS.reasoning,
    schema: routeReplySchema,
    schemaName: "route_reply",
    system: TURN_SYSTEM,
    maxOutputTokens: 2500,
    messages,
  });

  return { reply: data, tokensUsed: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) };
}
