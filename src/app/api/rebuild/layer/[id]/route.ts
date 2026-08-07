import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80).nullish(),
  hidden: z.boolean().nullish(),
  zIndex: z.number().int().nullish(),
});

// PATCH /api/rebuild/layer/[id]  { name?, hidden?, zIndex? } — the panel's
// direct-edit surface, for the things the user changes about a layer
// itself rather than about the image. Row-level update (not a jsonb blob
// rewrite) so two concurrent edits can't clobber each other's fields.
//
// `fill` used to live here, back when a layer was a vector path with a
// solid colour. A layer is now a detected region of a raster image, so
// there is no fill to set — changing how something LOOKS goes through
// /api/rebuild/[id]/edit and the image model instead.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id: layerId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid layer update." }, { status: 400 });
  }

  const [owned] = await db
    .select({ userId: schema.assets.userId })
    .from(schema.layers)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.layers.analysisId))
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.layers.id, layerId))
    .limit(1);

  if (!owned || owned.userId !== session.userId) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 });
  }

  const { name, hidden, zIndex } = parsed.data;
  const set: Partial<typeof schema.layers.$inferInsert> = {};
  if (name !== undefined && name !== null) set.name = name;
  if (hidden !== undefined && hidden !== null) set.hidden = hidden;
  if (zIndex !== undefined && zIndex !== null) set.zIndex = zIndex;

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.update(schema.layers).set(set).where(eq(schema.layers.id, layerId));

  return NextResponse.json({ ok: true });
}
