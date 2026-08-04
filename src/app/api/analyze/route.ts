import { NextResponse, after } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { runCritiquePipeline } from "@/lib/critique/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  assetId: z.string().uuid(),
});

// POST /api/analyze  { assetId } -> creates the analysis row and kicks off
// the critique pipeline in the background via `after()` (runs once the
// response has been sent — see
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md),
// returning analysisId immediately. Client subscribes to
// /api/analyze/[id]/stream for progress.
//
// Previously queued this through Inngest, which requires its dev server
// running locally (`npx inngest-cli dev`) — nothing was listening on
// :8288, so every call here threw before this route could even respond,
// and the client's `await res.json()` failed on the resulting empty body.
// `after()` needs nothing extra running and works the same in dev and on
// Vercel.
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to run a critique." }, { status: 401 });
  }
  if (session.kind === "guest") {
    return NextResponse.json(
      { error: "Guest sessions aren't saved — create an account to run this." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid assetId is required." }, { status: 400 });
  }

  const [asset] = await db
    .select({ id: schema.assets.id, userId: schema.assets.userId, storageKey: schema.assets.storageKey })
    .from(schema.assets)
    .where(eq(schema.assets.id, parsed.data.assetId))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (asset.userId !== session.userId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const [analysis] = await db
    .insert(schema.analyses)
    .values({ assetId: asset.id, kind: "critique", status: "queued", pipelineVersion: "pending" })
    .returning({ id: schema.analyses.id });

  after(async () => {
    try {
      await runCritiquePipeline({ analysisId: analysis.id, imageUrl: asset.storageKey });
    } catch (err) {
      // runCritiquePipeline already persists status:"failed" + the real
      // error message before rethrowing — this catch only stops the
      // rethrow from becoming an unhandled rejection in the function log.
      console.error("[analyze] critique pipeline failed:", err);
    }
  });

  return NextResponse.json({ analysisId: analysis.id }, { status: 202 });
}
