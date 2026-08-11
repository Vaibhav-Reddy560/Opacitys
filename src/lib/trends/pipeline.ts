import "server-only";
import { eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { GroqRateLimitError } from "@/lib/ai/models";
import { researchTrends, structureTrends, type TrendKind } from "./read";

export interface BudgetStatus {
  /**
   * Set only when a real Groq day-scope 429 reported a reset time still in
   * the future — the SOLE gate. This is ground truth from Groq itself.
   *
   * A 24h-rolling-sum-of-tokensUsed gate was tried and removed after it
   * produced a false block, live: every real reset this app has ever
   * observed has landed well under 24h (4min, 11min, 46min, 71min, and once
   * ~6.4h for a 222,941-token overrun) — Groq's actual "daily" window
   * recovers far faster than a literal 24h lookback would assume. With that
   * gate in place, a run whose OWN reported reset time had already passed
   * hours earlier was still refused, because one large run stayed inside
   * the 24h sum long after Groq itself had forgotten about it. Trusting
   * Groq's own number and nothing else avoids inventing a window this app
   * has no accurate model of.
   */
  blockedUntil: Date | null;
}

/**
 * The Groq free tier is one shared API key for the whole app, not a
 * per-user allowance (this is also why the cache in api/trends/route.ts is
 * deliberately global rather than scoped to a user) — so this looks at the
 * most recent still-future reset time from ANY user's failure, not just
 * the requesting user's.
 */
export async function checkBudget(): Promise<BudgetStatus> {
  const now = new Date();
  const [row] = await db
    .select({ resetAt: sql<string | null>`max(${schema.trendReads.rateLimitResetAt})` })
    .from(schema.trendReads)
    .where(gt(schema.trendReads.rateLimitResetAt, now));
  return { blockedUntil: row?.resetAt ? new Date(row.resetAt) : null };
}

export function hasBudgetForRun(status: BudgetStatus): boolean {
  return !status.blockedUntil || status.blockedUntil.getTime() <= Date.now();
}

/** Seconds until a run would be allowed again — for a Retry-After header. */
export function secondsUntilAvailable(status: BudgetStatus): number {
  if (status.blockedUntil) {
    return Math.max(1, Math.round((status.blockedUntil.getTime() - Date.now()) / 1000));
  }
  return 60; // shouldn't be called when not blocked; a minute is a safe minimum
}

export function describeBudget(status: BudgetStatus): string {
  const minutes = status.blockedUntil ? Math.max(1, Math.round((status.blockedUntil.getTime() - Date.now()) / 60000)) : 0;
  return `Groq's free daily token budget is used up — it refills on a rolling window, about ${minutes} minute${minutes === 1 ? "" : "s"} from now.`;
}

/**
 * Runs one Currents read: research the scope on the live web, then structure
 * it, persisting progress at each stage. Mirrors the shape of
 * src/lib/critique/pipeline.ts — same status transitions, same
 * catch-persists-the-real-reason-then-rethrows contract — but with a
 * `stage` column in between so the progress meter has something real to
 * watch across the two passes (see stream route).
 */
export async function runTrendRead(params: {
  readId: string;
  scope: string;
  kind: TrendKind | null;
  windowMonths: number;
}): Promise<{ readId: string }> {
  const { readId, scope, kind, windowMonths } = params;

  await db
    .update(schema.trendReads)
    .set({ status: "running", stage: "searching" })
    .where(eq(schema.trendReads.id, readId));

  // Persisted the moment it's known, even if pass 2 never runs — a
  // catch-block that only ran on total failure would lose pass 1's real
  // spend from the budget ledger, letting the app think it has headroom it
  // doesn't.
  let tokensSoFar = 0;

  try {
    // Persisted as its own step, separate from pass 2 — this is the
    // observable transition the stream route's progress event keys off
    // (matching pipelineVersion's role in the critique pipeline), and it
    // must land regardless of whether pass 2 succeeds. An earlier version
    // called a single readTrends() that only returned once both passes
    // succeeded, so a pass-2 failure silently discarded pass-1's
    // already-fetched digest/sources instead of persisting them here.
    const { digest, sources, tokensUsed: pass1Tokens } = await researchTrends({ scope, kind, windowMonths });
    tokensSoFar = pass1Tokens;

    await db
      .update(schema.trendReads)
      .set({ digest, sources, stage: "writing", tokensUsed: tokensSoFar })
      .where(eq(schema.trendReads.id, readId));

    const { result, tokensUsed: pass2Tokens } = await structureTrends({ digest, sources });
    tokensSoFar += pass2Tokens;

    await db
      .update(schema.trendReads)
      .set({
        result,
        model: "openai/gpt-oss-120b",
        status: "complete",
        stage: null,
        tokensUsed: tokensSoFar,
      })
      .where(eq(schema.trendReads.id, readId));

    return { readId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The Currents read failed.";
    const rateLimitResetAt =
      err instanceof GroqRateLimitError && err.scope === "day" && err.retryAfterSeconds !== null
        ? new Date(Date.now() + err.retryAfterSeconds * 1000)
        : null;
    await db
      .update(schema.trendReads)
      .set({ status: "failed", error: message, stage: null, tokensUsed: tokensSoFar, rateLimitResetAt })
      .where(eq(schema.trendReads.id, readId));
    throw err;
  }
}
