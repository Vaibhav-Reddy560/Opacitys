import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteAsset, getAsset } from "@/lib/library/queries";

export const runtime = "nodejs";

// GET /api/library/assets/[id] -> one asset with its result ids. Used
// client-side by OriginalityForm to bootstrap from a picked asset passed via
// ?assetId= — everywhere else that needs the list reads it server-side.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const asset = await getAsset(session.userId, id);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json({ asset });
}

// DELETE /api/library/assets/[id] -> removes the asset, its Blob object, and
// (via FK cascade) every analysis/originality-check/tool-answer that
// referenced it. A real delete, not a soft flag — see deleteAsset's comment.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const ok = await deleteAsset(session.userId, id);
  if (!ok) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
