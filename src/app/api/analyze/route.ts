import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { inngest } from "@/lib/queue/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  assetId: z.string().uuid(),
});

// POST /api/analyze  { assetId } -> enqueues the critique pipeline, returns
// analysisId immediately. Client subscribes to
// /api/analyze/[id]/stream for progress.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [asset] = await db
    .select({ id: schema.assets.id, storageKey: schema.assets.storageKey })
    .from(schema.assets)
    .where(eq(schema.assets.id, parsed.data.assetId))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const [analysis] = await db
    .insert(schema.analyses)
    .values({ assetId: asset.id, status: "queued", pipelineVersion: "pending" })
    .returning({ id: schema.analyses.id });

  await inngest.send({
    name: "analysis/requested",
    data: { analysisId: analysis.id, assetId: asset.id, imageUrl: asset.storageKey },
  });

  return NextResponse.json({ analysisId: analysis.id }, { status: 202 });
}
