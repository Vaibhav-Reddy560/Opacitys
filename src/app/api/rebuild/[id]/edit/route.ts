import { NextResponse, after } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { runRebuildEdit } from "@/lib/rebuild/edit";

export const runtime = "nodejs";
// Generation (~15-40s) + re-detection + thumbnail crops, all inside the
// after() callback, which is bounded by THIS route's own maxDuration.
// Kept in sync with the version stream route's ceiling.
export const maxDuration = 300;

const bodySchema = z.object({
  instruction: z.string().trim().min(1).max(600),
  /** Edit aimed at a detected layer. */
  layerId: z.string().uuid().nullish(),
  /** Edit aimed at a hand-drawn marquee, in the parent image's pixel space. */
  region: z.array(z.number()).length(4).nullish(),
  /** Branch from a specific version; defaults to the newest completed one. */
  parentVersionId: z.string().uuid().nullish(),
});

// POST /api/rebuild/[id]/edit  { instruction, layerId?, region?, parentVersionId? }
// -> queues a new version and runs the edit in the background, returning
// the versionId immediately. Client subscribes to
// /api/rebuild/version/[versionId]/stream for progress.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id: analysisId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "An instruction is required." }, { status: 400 });
  }

  // Ownership: analyses has no user_id of its own, only assets does.
  const [owned] = await db
    .select({ userId: schema.assets.userId })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, analysisId))
    .limit(1);
  if (!owned || owned.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { instruction, layerId, region, parentVersionId } = parsed.data;

  const [parent] = parentVersionId
    ? await db
        .select({ id: schema.rebuildVersions.id, imageUrl: schema.rebuildVersions.imageUrl })
        .from(schema.rebuildVersions)
        .where(
          and(eq(schema.rebuildVersions.id, parentVersionId), eq(schema.rebuildVersions.analysisId, analysisId)),
        )
        .limit(1)
    : await db
        .select({ id: schema.rebuildVersions.id, imageUrl: schema.rebuildVersions.imageUrl })
        .from(schema.rebuildVersions)
        .where(
          and(eq(schema.rebuildVersions.analysisId, analysisId), eq(schema.rebuildVersions.status, "complete")),
        )
        .orderBy(desc(schema.rebuildVersions.createdAt))
        .limit(1);

  if (!parent?.imageUrl) {
    return NextResponse.json({ error: "There's no finished image to edit yet." }, { status: 409 });
  }

  // A layer supplies both the name and the box to scope the instruction
  // with; a marquee supplies only a box.
  let layerName: string | null = null;
  let regionBox: [number, number, number, number] | null = null;
  if (layerId) {
    const [layer] = await db
      .select({ name: schema.layers.name, geometry: schema.layers.geometry })
      .from(schema.layers)
      .where(and(eq(schema.layers.id, layerId), eq(schema.layers.analysisId, analysisId)))
      .limit(1);
    if (layer) {
      layerName = layer.name;
      const geo = (layer.geometry ?? {}) as { bbox?: number[] };
      if (Array.isArray(geo.bbox) && geo.bbox.length === 4) {
        regionBox = geo.bbox as [number, number, number, number];
      }
    }
  } else if (region) {
    regionBox = region as [number, number, number, number];
  }

  const [version] = await db
    .insert(schema.rebuildVersions)
    .values({
      analysisId,
      parentId: parent.id,
      instruction,
      status: "queued",
      label: null,
    })
    .returning({ id: schema.rebuildVersions.id });

  after(async () => {
    try {
      await runRebuildEdit({
        versionId: version.id,
        analysisId,
        userId: session.userId,
        parentImageUrl: parent.imageUrl!,
        instruction,
        layerName,
        region: regionBox,
      });
    } catch (err) {
      // runRebuildEdit already persisted status:"failed" + the real reason
      // before rethrowing; this only stops an unhandled rejection.
      console.error("[rebuild] edit failed:", err);
    }
  });

  return NextResponse.json({ versionId: version.id }, { status: 202 });
}
