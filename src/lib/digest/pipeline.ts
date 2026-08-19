import "server-only";
import { and, eq, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { checkBudget, hasBudgetForRun } from "@/lib/trends/pipeline";
import { researchStyles, researchNews, structureStyles, structureNews } from "./read";

export type DigestKind = "styles" | "news";

// A claimed-but-unfinished row older than this is treated as abandoned, not
// in-flight. A real run is 2-45s end to end (measured); anything still
// "running" after 10 minutes means the function instance that claimed it
// died mid-generation — serverless invocations can be torn down before an
// after() callback finishes — and nothing will ever come back to finish it.
const STALE_RUN_MS = 10 * 60 * 1000;

// Breathing room between the two kinds. Sequencing them alone was not
// enough: measured live, styles would finish and news would immediately
// 429 on Groq's per-minute TOKEN budget ("try again in about 5s"), because
// four gpt-oss-120b calls from two pipelines still landed inside the same
// minute. models.ts already retries a minute-scope 429 once, and even that
// wasn't enough. This is background work behind after() — nothing is
// waiting on it — so simply not racing the window is cheaper than burning
// retries (each retry re-runs a Tavily search, which costs a real credit).
const INTER_KIND_GAP_MS = 25_000;

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Generates today's (UTC) digest for `kind` unless it's already done or
 * genuinely in flight. Meant to be called from every studio page load via
 * `after()` — safe to call repeatedly and concurrently.
 *
 * The claim is a single atomic upsert against the unique (kind, digest_date)
 * index, which is what makes concurrent callers safe: exactly one wins and
 * gets a row back, everyone else gets nothing and returns. `setWhere`
 * decides what "already handled" means, and it deliberately does NOT include
 * failed or abandoned rows:
 *
 *   - complete            -> not re-claimed. Today's work is done.
 *   - running, recent     -> not re-claimed. Someone else is mid-generation.
 *   - failed              -> RE-CLAIMED. Retry.
 *   - running, stale      -> RE-CLAIMED. The previous claimer died.
 *
 * That retry path is the fix for a real, observed outage: this used to be a
 * plain `onConflictDoNothing`, so the mere EXISTENCE of today's row — even a
 * failed one — blocked every later attempt. Three consecutive days (Aug 15,
 * 16, 19) each died on a *transient* Groq per-minute limit ("try again in
 * about 1s") in the first request of the day, and then served Aug 14's
 * content until the date rolled over, because nothing was allowed to try
 * again. A failure that resolves itself in one second must not cost a day.
 */
async function claimToday(kind: DigestKind): Promise<string | null> {
  const staleCutoff = new Date(Date.now() - STALE_RUN_MS);
  const claimed = await db
    .insert(schema.dailyDigest)
    .values({ kind, digestDate: todayDateStr(), status: "running" })
    .onConflictDoUpdate({
      target: [schema.dailyDigest.kind, schema.dailyDigest.digestDate],
      // createdAt doubles as "when this attempt started" — rewriting it here
      // is what makes the staleness check above measure the CURRENT attempt
      // rather than the first one of the day.
      set: { status: "running", error: null, createdAt: new Date() },
      setWhere: or(
        eq(schema.dailyDigest.status, "failed"),
        and(eq(schema.dailyDigest.status, "running"), lt(schema.dailyDigest.createdAt, staleCutoff)),
      ),
    })
    .returning({ id: schema.dailyDigest.id });

  return claimed[0]?.id ?? null;
}

async function generate(kind: DigestKind, rowId: string): Promise<void> {
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
    throw err;
  }
}

/**
 * Generates today's digest for one kind, if it isn't already done or in
 * flight. Returns whether it actually ran a generation (i.e. spent provider
 * budget) — false means there was nothing to do.
 */
export async function ensureDailyDigest(kind: DigestKind): Promise<boolean> {
  const budget = await checkBudget();
  if (!hasBudgetForRun(budget)) return false;

  const rowId = await claimToday(kind);
  if (!rowId) return false; // already complete, or another request owns it right now
  await generate(kind, rowId);
  return true;
}

/**
 * Both kinds, SEQUENTIALLY — the entry point studio/layout.tsx should use.
 *
 * Not two independent after() callbacks, which is what shipped first and
 * what actually broke this feature in production: they fired at the same
 * millisecond (confirmed in the stored rows — identical created_at to the
 * ms on every failed day), putting four Groq calls from two pipelines into
 * the same per-minute window on one shared free-tier key. They rate-limited
 * *each other*. The same two pipelines run back-to-back succeeded every
 * time locally (scripts/probe-digest.ts, which is sequential), which is the
 * evidence this ordering is the fix rather than a guess.
 *
 * `allSettled` semantics by hand: styles failing must not skip news.
 */
export async function ensureDailyDigests(): Promise<void> {
  const kinds = ["styles", "news"] as const;
  let didWork = false;
  for (const [i, kind] of kinds.entries()) {
    // Only pay the gap between two runs that actually did work — when
    // today's styles row is already complete, claimToday returns null
    // immediately and there's nothing to space out.
    if (i > 0 && didWork) await new Promise((r) => setTimeout(r, INTER_KIND_GAP_MS));
    try {
      didWork = await ensureDailyDigest(kind);
    } catch (err) {
      didWork = true; // it spent Groq budget before failing — still space out the next one
      console.error(`[digest] ${kind} generation failed:`, err instanceof Error ? err.message : err);
    }
  }
}
