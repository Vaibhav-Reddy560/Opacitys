import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { computeFingerprint, fingerprintBasis } from "@/lib/profile/fingerprint";
import { getStoredProfile, saveStoredProfile, profilePatchSchema } from "@/lib/profile/stored";

export const runtime = "nodejs";

// GET /api/profile -> the derived fingerprint plus the stored (self-reported)
// half. No model call — everything here is measured or typed in by the user.
// The page itself server-renders the same data directly; this route exists
// for the client form to re-read after a save.
export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const [fingerprint, stored] = await Promise.all([
    computeFingerprint(session.userId),
    getStoredProfile(session.userId),
  ]);

  return NextResponse.json({
    fingerprint,
    stored,
    // Whether the cached written read still describes these numbers. The UI
    // only offers a refresh when this is false, so the model is never
    // re-billed just for viewing the page.
    narrativeStale: stored.narrative !== null && stored.narrativeBasis !== fingerprintBasis(fingerprint),
  });
}

// PATCH /api/profile -> save the self-reported fields. Nothing here is
// inferred: a critique score says nothing about which apps someone owns.
export async function PATCH(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const parsed = profilePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Could not save those details." }, { status: 400 });
  }

  await saveStoredProfile(session.userId, parsed.data);
  const stored = await getStoredProfile(session.userId);
  return NextResponse.json({ stored });
}
