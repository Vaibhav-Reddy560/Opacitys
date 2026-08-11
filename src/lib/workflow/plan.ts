import "server-only";
import { z } from "zod";
import { generateJson, MODELS } from "@/lib/ai/models";

/**
 * Route's core: a client brief plus what the designer actually has, turned
 * into an ordered plan. One `generateJson` call, no web search — this is
 * reasoning over the brief and the designer's own stated resources, not a
 * live-web question, so it stays a single bounded call rather than the
 * token-bomb shape `generateResearched` has been measured at elsewhere
 * (src/lib/ai/models.ts's doc comment: 452k prompt tokens unconstrained,
 * 222,941 in one call even under a prompt-level cap).
 */

const approachSchema = z.object({
  name: z.string(),
  summary: z.string(),
  // false = an approach the designer would reach for anyway. true = one of
  // the "at least one you probably haven't tried" the module promises.
  unfamiliar: z.boolean(),
  whySuits: z.string(),
});

const stepSchema = z.object({
  title: z.string(),
  tool: z.string(), // named plainly — not necessarily one they have; see gaps
  feature: z.string(), // the specific feature INSIDE that tool
  done: z.string(), // what finished looks like for this step
  hours: z.number(),
  // Relative to the designer's OWN recorded skill level, not an absolute
  // scale — "a stretch" for a senior means something different than for
  // someone who marked themselves "learning".
  difficulty: z.enum(["comfortable", "a stretch", "new to you"]),
});

export const routePlanSchema = z.object({
  reading: z.string(), // what the brief is actually asking for, in plain terms
  approaches: z.array(approachSchema).min(2).max(4),
  chosen: z.string(), // which approach the steps below follow, and why
  steps: z.array(stepSchema).min(3).max(12),
  totalHours: z.number(),
  gaps: z.array(z.string()), // what a step needs that the designer doesn't have
  assumptions: z.array(z.string()), // anything guessed rather than stated in the brief
});
export type RoutePlan = z.infer<typeof routePlanSchema>;

const PLAN_SYSTEM = `You are a practical creative director sequencing real work for a working graphic designer — not brainstorming ideas, building a plan they can actually walk.

Rules:
- "reading": state what the brief is ACTUALLY asking for, in your own words — surface anything vague or underspecified rather than silently assuming.
- "approaches": 2-4 genuinely distinct ways to tackle this brief, not variations on one idea. Mark "unfamiliar": true on at least one — a real approach that suits the brief but the designer likely hasn't reached for before, with "whySuits" explaining why it's still a good fit, not just novel.
- "chosen": name which approach the "steps" below follow, and why it beats the others for THIS brief and THIS designer's resources.
- "steps": an ORDERED plan. Every step names a real tool and the specific feature inside it — "Figma: Auto Layout", not "design software". "done" is a concrete, checkable state, not "make progress". Prefer tools from the designer's stated list; if a step genuinely needs something they don't have, use it anyway but name the gap in "gaps" — don't quietly substitute a worse tool just to avoid a gap.
- "difficulty" is relative to the designer's OWN stated skill level, not an absolute scale.
- "gaps": anything a step needs that isn't in the designer's stated tools — a real tool, a missing skill, an asset the brief didn't provide. Empty array if there are none — don't invent one.
- "assumptions": anything you had to guess because the brief didn't say — timeline details, audience, format. Empty array if nothing was assumed.
- Never invent client details not present in the brief.

Return ONLY valid JSON in exactly this shape, every key present on every entry:
{"reading":"...","approaches":[{"name":"...","summary":"...","unfamiliar":false,"whySuits":"..."}],"chosen":"...","steps":[{"title":"...","tool":"...","feature":"...","done":"...","hours":2,"difficulty":"comfortable"}],"totalHours":8,"gaps":["..."],"assumptions":["..."]}`;

export async function generatePlan(params: {
  brief: string;
  deadline: string | null;
  tools: string[];
  skillLevel: string | null;
}): Promise<{ plan: RoutePlan; tokensUsed: number }> {
  const resourceLines = [
    params.deadline && `Deadline: ${params.deadline}`,
    `Tools the designer has: ${params.tools.length > 0 ? params.tools.join(", ") : "none stated"}`,
    `Skill level: ${params.skillLevel ?? "not stated"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, usage } = await generateJson({
    model: MODELS.reasoning,
    schema: routePlanSchema,
    schemaName: "route_plan",
    system: PLAN_SYSTEM,
    maxOutputTokens: 2500,
    messages: [
      {
        role: "user",
        content: `Brief:\n${params.brief}\n\n${resourceLines}`,
      },
    ],
  });

  return { plan: data, tokensUsed: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) };
}
