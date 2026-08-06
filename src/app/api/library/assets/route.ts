import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { listAssets } from "@/lib/library/queries";

export const runtime = "nodejs";

// GET /api/library/assets -> the signed-in user's uploads, newest first,
// each with a flag for which features already have a completed result on
// it. Backs the library grid and every feature page's AssetPicker.
export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const assets = await listAssets(session.userId);
  return NextResponse.json({ assets });
}
