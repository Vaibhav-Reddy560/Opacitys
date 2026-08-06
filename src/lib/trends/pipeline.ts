import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { researchTrends, structureTrends, type TrendKind } from "./read";

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

  try {
    // Persisted as its own step, separate from pass 2 — this is the
    // observable transition the stream route's progress event keys off
    // (matching pipelineVersion's role in the critique pipeline), and it
    // must land regardless of whether pass 2 succeeds. An earlier version
    // called a single readTrends() that only returned once both passes
    // succeeded, so a pass-2 failure silently discarded pass-1's
    // already-fetched digest/sources instead of persisting them here.
    const { digest, sources } = await researchTrends({ scope, kind, windowMonths });

    await db
      .update(schema.trendReads)
      .set({ digest, sources, stage: "writing" })
      .where(eq(schema.trendReads.id, readId));

    const result = await structureTrends({ digest, sources });

    await db
      .update(schema.trendReads)
      .set({
        result,
        model: "groq/llama-3.3-70b-versatile+openai/gpt-oss-120b",
        status: "complete",
        stage: null,
      })
      .where(eq(schema.trendReads.id, readId));

    return { readId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The Currents read failed.";
    await db
      .update(schema.trendReads)
      .set({ status: "failed", error: message, stage: null })
      .where(eq(schema.trendReads.id, readId));
    throw err;
  }
}
