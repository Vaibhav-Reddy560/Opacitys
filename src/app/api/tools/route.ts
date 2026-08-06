import { NextResponse, after } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { cacheKeyFor, readFromScreenshot } from "@/lib/tools/answer";
import { runToolAnswer } from "@/lib/tools/pipeline";
import { GroqRateLimitError, MODELS } from "@/lib/ai/models";

export const runtime = "nodejs";
// Same reasoning as /api/trends: after() is bounded by this route's own
// maxDuration, and the research path has been measured at 30-70s+ for
// Currents' heavier prompt — this one is capped tighter (2/2 vs 3/4) but
// gets the same margin.
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(500),
  tool: z.string().trim().max(80).nullish(),
  version: z.string().trim().max(40).nullish(),
  assetId: z.string().uuid().nullish(),
});

// A cached research-path answer older than this is stale — tool UIs and
// pricing move fast enough that an indefinite cache would quietly mislead.
const CACHE_TTL_DAYS = 7;

// POST /api/tools { question, tool?, version?, assetId? } -> one of three
// shapes:
//   - assetId present: synchronous screenshot read (vision, no search,
//     ~15s) -> { id, mode: "sync" }, 201. Never cached — the answer is
//     specific to that exact image.
//   - assetId absent, cache hit -> { id, mode: "cached" }, 200.
//   - assetId absent, cache miss -> queued row, background research via
//     after(), followed over /api/tools/[id]/stream -> { id, mode: "queued" },
//     202. Same pattern as /api/trends + /api/trends/[id]/stream.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to use Instruments." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  const { question, assetId } = parsed.data;
  const tool = parsed.data.tool ?? null;
  const version = parsed.data.version ?? null;

  // -------------------------------------------------------------------
  // Screenshot path — synchronous
  // -------------------------------------------------------------------
  if (assetId) {
    const [asset] = await db
      .select({ userId: schema.assets.userId, storageKey: schema.assets.storageKey })
      .from(schema.assets)
      .where(eq(schema.assets.id, assetId))
      .limit(1);
    if (!asset || asset.userId !== session.userId) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    try {
      const result = await readFromScreenshot({ imageUrl: asset.storageKey, question, tool, version });

      const [row] = await db
        .insert(schema.toolAnswers)
        .values({
          userId: session.userId,
          question,
          tool,
          version,
          assetId,
          cacheKey: null, // screenshot answers are never cached or cache-served
          status: "complete",
          result,
          sources: [],
          model: `groq/${MODELS.vision}`,
        })
        .returning({ id: schema.toolAnswers.id });

      return NextResponse.json({ id: row.id, mode: "sync" }, { status: 201 });
    } catch (err) {
      if (err instanceof GroqRateLimitError) {
        return NextResponse.json({ error: err.message }, { status: 429 });
      }
      const message = err instanceof Error ? `Could not read that screenshot: ${err.message}` : "Could not read that screenshot.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // -------------------------------------------------------------------
  // Research path — cache check, then background
  // -------------------------------------------------------------------
  const cacheKey = cacheKeyFor({ question, tool, version });

  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [cached] = await db
    .select({ id: schema.toolAnswers.id })
    .from(schema.toolAnswers)
    .where(
      and(
        eq(schema.toolAnswers.cacheKey, cacheKey),
        eq(schema.toolAnswers.status, "complete"),
        gte(schema.toolAnswers.createdAt, cutoff),
      ),
    )
    .orderBy(desc(schema.toolAnswers.createdAt))
    .limit(1);

  if (cached) {
    return NextResponse.json({ id: cached.id, mode: "cached" });
  }

  const [row] = await db
    .insert(schema.toolAnswers)
    .values({ userId: session.userId, question, tool, version, cacheKey, status: "queued" })
    .returning({ id: schema.toolAnswers.id });

  after(async () => {
    try {
      await runToolAnswer({ answerId: row.id, question, tool, version });
    } catch (err) {
      console.error("[tools] answer failed:", err);
    }
  });

  return NextResponse.json({ id: row.id, mode: "queued" }, { status: 202 });
}
