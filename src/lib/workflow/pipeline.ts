import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MODELS } from "@/lib/ai/models";
import { generatePlan, routePlanSchema, type RoutePlan } from "./plan";
import { generateReply, type TurnRecord } from "./turn";

/**
 * Runs one Route plan. Only one stage ("planning") rather than the
 * two-stage search-then-structure shape Currents/Instruments use — there's
 * no separate research pass to persist a midpoint for for; generatePlan()
 * is a single bounded call, so faking an intermediate stage here would be
 * motion without anything real behind it.
 */
export async function runRoutePlan(params: {
  planId: string;
  brief: string;
  deadline: string | null;
  tools: string[];
  skillLevel: string | null;
}): Promise<{ planId: string }> {
  const { planId, brief, deadline, tools, skillLevel } = params;

  await db
    .update(schema.routePlans)
    .set({ status: "running", stage: "planning" })
    .where(eq(schema.routePlans.id, planId));

  try {
    const { plan } = await generatePlan({ brief, deadline, tools, skillLevel });

    await db
      .update(schema.routePlans)
      .set({
        result: plan,
        model: MODELS.reasoning,
        status: "complete",
        stage: null,
      })
      .where(eq(schema.routePlans.id, planId));

    return { planId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The plan failed.";
    await db
      .update(schema.routePlans)
      .set({ status: "failed", error: message, stage: null })
      .where(eq(schema.routePlans.id, planId));
    throw err;
  }
}

/** The plan a new follow-up should be reasoned against — the newest revision if there's been one, else the plan as generated. */
async function resolveCurrentPlan(planId: string): Promise<RoutePlan> {
  const [revised] = await db
    .select({ revisedPlan: schema.routeTurns.revisedPlan })
    .from(schema.routeTurns)
    .where(and(eq(schema.routeTurns.planId, planId), isNotNull(schema.routeTurns.revisedPlan)))
    .orderBy(desc(schema.routeTurns.createdAt))
    .limit(1);
  if (revised) return routePlanSchema.parse(revised.revisedPlan);

  const [plan] = await db.select({ result: schema.routePlans.result }).from(schema.routePlans).where(eq(schema.routePlans.id, planId)).limit(1);
  return routePlanSchema.parse(plan.result);
}

/**
 * Runs one follow-up turn. The designer's question is already persisted as
 * its own "complete" row by the route handler before this ever runs (see
 * POST /api/route/[id]/turn) — this only fills in the assistant's reply.
 *
 * History is derived, not passed in: every "complete" turn for this plan,
 * oldest first, with the LAST one being the question just asked. This
 * keeps one source of truth (the DB) instead of the route handler and the
 * pipeline separately agreeing on what "the new question" is.
 */
export async function runRouteTurn(params: { turnId: string; planId: string }): Promise<{ turnId: string }> {
  const { turnId, planId } = params;

  await db
    .update(schema.routeTurns)
    .set({ status: "running", stage: "thinking" })
    .where(eq(schema.routeTurns.id, turnId));

  try {
    const [plan] = await db
      .select({
        brief: schema.routePlans.brief,
        deadline: schema.routePlans.deadline,
        tools: schema.routePlans.tools,
        skillLevel: schema.routePlans.skillLevel,
      })
      .from(schema.routePlans)
      .where(eq(schema.routePlans.id, planId))
      .limit(1);
    if (!plan) throw new Error("That plan no longer exists.");

    const currentPlan = await resolveCurrentPlan(planId);

    const completeTurns = await db
      .select({ role: schema.routeTurns.role, content: schema.routeTurns.content })
      .from(schema.routeTurns)
      .where(and(eq(schema.routeTurns.planId, planId), eq(schema.routeTurns.status, "complete")))
      .orderBy(asc(schema.routeTurns.createdAt));

    const newest = completeTurns[completeTurns.length - 1];
    if (!newest || newest.role !== "user") {
      throw new Error("Could not find the question this reply is answering.");
    }
    const question = newest.content ?? "";
    const history: TurnRecord[] = completeTurns
      .slice(0, -1)
      .map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: t.content ?? "" }));

    const { reply } = await generateReply({
      brief: plan.brief,
      deadline: plan.deadline,
      tools: plan.tools ?? [],
      skillLevel: plan.skillLevel,
      plan: currentPlan,
      history,
      question,
    });

    await db
      .update(schema.routeTurns)
      .set({
        content: reply.reply,
        revisedPlan: reply.revisedPlan,
        changeSummary: reply.changeSummary,
        status: "complete",
        stage: null,
      })
      .where(eq(schema.routeTurns.id, turnId));

    return { turnId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The reply failed.";
    await db
      .update(schema.routeTurns)
      .set({ status: "failed", error: message, stage: null })
      .where(eq(schema.routeTurns.id, turnId));
    throw err;
  }
}
