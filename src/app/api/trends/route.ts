import { NextResponse, after } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { cacheKeyFor, type TrendKind } from "@/lib/trends/read";
import { runTrendRead } from "@/lib/trends/pipeline";

export const runtime = "nodejs";
// Same reasoning as /api/analyze: after() is bounded by this route's own
// maxDuration, and a real research pass has been measured at 30-70s+, so
// 300s keeps a healthy margin.
export const maxDuration = 300;

const bodySchema = z.object({
  scope: z.string().trim().min(1).max(200),
  kind: z.enum(["category", "platform", "brand"]).nullish(),
  windowMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(6),
  force: z.boolean().default(false),
});

// A cached read older than this is treated as stale — "what's moving right
// now" promises recency, so an indefinite cache would quietly go stale.
const CACHE_TTL_DAYS = 7;

// POST /api/trends { scope, kind?, windowMonths?, force? } -> either an
// instant cache hit ({ id, cached: true }, 200) or a freshly-queued read
// ({ id, cached: false }, 202) that runs in the background via after() and
// is followed over /api/trends/[id]/stream — same pattern as
// /api/analyze + /api/analyze/[id]/stream.
//
// The cache lookup is global (not scoped to the requesting user): a Currents
// read isn't private information, and reusing any recent read for the same
// scope is what keeps this affordable against Groq's free-tier daily token
// cap (measured live: one unconstrained research pass alone can consume the
// entire day's allowance).
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set — add it to .env.local to use Currents." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A scope to read is required." }, { status: 400 });
  }

  const { scope, windowMonths, force } = parsed.data;
  const kind: TrendKind | null = parsed.data.kind ?? null;
  const cacheKey = cacheKeyFor({ scope, kind, windowMonths });

  if (!force) {
    const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const [cached] = await db
      .select({ id: schema.trendReads.id })
      .from(schema.trendReads)
      .where(
        and(
          eq(schema.trendReads.cacheKey, cacheKey),
          eq(schema.trendReads.status, "complete"),
          gte(schema.trendReads.createdAt, cutoff),
        ),
      )
      .orderBy(desc(schema.trendReads.createdAt))
      .limit(1);

    if (cached) {
      return NextResponse.json({ id: cached.id, cached: true });
    }
  }

  const [row] = await db
    .insert(schema.trendReads)
    .values({
      userId: session.userId,
      scope,
      kind,
      windowMonths,
      cacheKey,
      status: "queued",
    })
    .returning({ id: schema.trendReads.id });

  after(async () => {
    try {
      await runTrendRead({ readId: row.id, scope, kind, windowMonths });
    } catch (err) {
      // runTrendRead already persists status:"failed" + the real error
      // message before rethrowing — this catch only stops that rethrow from
      // becoming an unhandled rejection in the function log.
      console.error("[trends] read failed:", err);
    }
  });

  return NextResponse.json({ id: row.id, cached: false }, { status: 202 });
}
