import { NextResponse, after } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runRebuildPipeline } from "@/lib/rebuild/pipeline";

export const runtime = "nodejs";
// Kept in sync with the stream route's own maxDuration — see the comment
// there and on the equivalent analyze route for why the two ceilings have
// to agree (after() is bounded by this route's own maxDuration; a mismatch
// leaves a row stuck at "running" until the stream route's stale-run
// reaper recovers it).
export const maxDuration = 300;

const bodySchema = z.object({
  assetId: z.string().uuid(),
});

// POST /api/rebuild  { assetId } -> creates the analysis row and kicks off
// the rebuild pipeline in the background via after(), returning analysisId
// immediately. Client subscribes to /api/rebuild/[id]/stream for progress.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid assetId is required." }, { status: 400 });
  }

  const [asset] = await db
    .select({ id: schema.assets.id, userId: schema.assets.userId, storageKey: schema.assets.storageKey })
    .from(schema.assets)
    .where(eq(schema.assets.id, parsed.data.assetId))
    .limit(1);

  if (!asset || asset.userId !== session.userId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const [analysis] = await db
    .insert(schema.analyses)
    .values({ assetId: asset.id, kind: "rebuild", status: "queued", pipelineVersion: "pending" })
    .returning({ id: schema.analyses.id });

  after(async () => {
    try {
      await runRebuildPipeline({ analysisId: analysis.id, assetId: asset.id, userId: session.userId, imageUrl: asset.storageKey });
    } catch (err) {
      // runRebuildPipeline already persists status:"failed" + the real
      // error message before rethrowing — this catch only stops the
      // rethrow from becoming an unhandled rejection in the function log.
      console.error("[rebuild] pipeline failed:", err);
    }
  });

  return NextResponse.json({ analysisId: analysis.id }, { status: 202 });
}
