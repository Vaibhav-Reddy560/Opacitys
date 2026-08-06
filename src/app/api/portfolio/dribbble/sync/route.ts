import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { syncDribbbleShots, disconnectDribbble } from "@/lib/portfolio/dribbble";

export const runtime = "nodejs";

// POST /api/portfolio/dribbble/sync -> refetches the shot list. No view/like
// counts are fetched or stored — Dribbble v2 doesn't return them (see the
// module comment in src/lib/portfolio/dribbble.ts).
export async function POST() {
  const { session, error } = await requireUser();
  if (error) return error;

  try {
    const { shots } = await syncDribbbleShots(session.userId);
    return NextResponse.json({ shots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not sync Dribbble." },
      { status: 502 },
    );
  }
}

// DELETE /api/portfolio/dribbble/sync -> disconnects. Named on the same
// route as sync rather than a separate /disconnect path — both are the only
// two things you can do to an existing connection.
export async function DELETE() {
  const { session, error } = await requireUser();
  if (error) return error;

  await disconnectDribbble(session.userId);
  return NextResponse.json({ ok: true });
}
