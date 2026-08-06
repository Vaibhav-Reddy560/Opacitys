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
  // Hex only, not any CSS color string — this value gets composed directly
  // into an exported SVG's fill attribute (rebuild-canvas.tsx's Download
  // SVG button). A native <input type="color"> only ever produces
  // #rrggbb, so this isn't a UI restriction, only a closed door against a
  // crafted PATCH body trying to inject markup through a "color" field.
  fill: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{3,8}$/, "Must be a hex color")
    .nullish(),
});

// PATCH /api/rebuild/layer/[id]  { name?, hidden?, zIndex?, fill? } — the
// inspector's edit surface. Row-level update (not a jsonb blob rewrite) so
// two concurrent edits from the same session can't clobber each other's
// unrelated fields. `fill` writes into the `style` jsonb column, merged
// rather than replaced, since `style` may carry other keys later.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id: layerId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid layer update." }, { status: 400 });
  }

  const [owned] = await db
    .select({ userId: schema.assets.userId, style: schema.layers.style })
    .from(schema.layers)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.layers.analysisId))
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.layers.id, layerId))
    .limit(1);

  if (!owned || owned.userId !== session.userId) {
    return NextResponse.json({ error: "Layer not found" }, { status: 404 });
  }

  const { name, hidden, zIndex, fill } = parsed.data;
  const set: Partial<typeof schema.layers.$inferInsert> = {};
  if (name !== undefined && name !== null) set.name = name;
  if (hidden !== undefined && hidden !== null) set.hidden = hidden;
  if (zIndex !== undefined && zIndex !== null) set.zIndex = zIndex;
  if (fill !== undefined && fill !== null) {
    const currentStyle = (owned.style ?? {}) as Record<string, unknown>;
    set.style = { ...currentStyle, fill };
  }

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.update(schema.layers).set(set).where(eq(schema.layers.id, layerId));

  return NextResponse.json({ ok: true });
}
