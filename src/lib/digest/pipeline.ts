import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { checkBudget, hasBudgetForRun } from "@/lib/trends/pipeline";
import { researchStyles, researchNews, structureStyles, structureNews } from "./read";

export type DigestKind = "styles" | "news";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Generates today's (UTC) digest for `kind`, if it doesn't already exist.
 * Meant to be called unconditionally from every studio page load via
 * `after()` — safe to call repeatedly and concurrently:
 *
 *  - The shared Groq budget gate (checkBudget/hasBudgetForRun, imported from
 *    trends/pipeline.ts rather than re-implemented) is checked BEFORE
 *    claiming today's row, so a blocked run doesn't leave a dead "failed"
 *    placeholder behind — a later request just tries again once the budget
 *    frees up.
 *  - The unique index on (kind, digest_date) plus `.onConflictDoNothing()`
 *    means only the first caller of the day actually inserts a row; every
 *    other concurrent caller's insert returns zero rows and bails
 *    immediately, so two studio navigations landing at once around
 *    day-rollover can never both spend Tavily/Groq budget on the same day.
 */
export async function ensureDailyDigest(kind: DigestKind): Promise<void> {
  const budget = await checkBudget();
  if (!hasBudgetForRun(budget)) return;

  const digestDate = todayDateStr();
  const inserted = await db
    .insert(schema.dailyDigest)
    .values({ kind, digestDate, status: "running" })
    .onConflictDoNothing({ target: [schema.dailyDigest.kind, schema.dailyDigest.digestDate] })
    .returning({ id: schema.dailyDigest.id });

  if (inserted.length === 0) return; // another request already owns today's row
  const rowId = inserted[0].id;

  try {
    const { digest, sources, tokensUsed: pass1Tokens } =
      kind === "styles" ? await researchStyles() : await researchNews();

    const { result, tokensUsed: pass2Tokens } =
      kind === "styles" ? await structureStyles({ digest, sources }) : await structureNews({ digest, sources });

    await db
      .update(schema.dailyDigest)
      .set({
        digest,
        sources,
        items: result.items,
        model: "openai/gpt-oss-120b",
        status: "complete",
        tokensUsed: pass1Tokens + pass2Tokens,
      })
      .where(eq(schema.dailyDigest.id, rowId));
  } catch (err) {
    const message = err instanceof Error ? err.message : `The ${kind} digest failed to generate.`;
    await db
      .update(schema.dailyDigest)
      .set({ status: "failed", error: message })
      .where(eq(schema.dailyDigest.id, rowId));
    // Rethrown, not swallowed — same contract as runTrendRead
    // (src/lib/trends/pipeline.ts): the failure is already durably recorded
    // on the row above, and the caller's after() block is what actually
    // catches this (see studio/layout.tsx), matching how
    // api/trends/route.ts's after() block catches runTrendRead.
    throw err;
  }
}
