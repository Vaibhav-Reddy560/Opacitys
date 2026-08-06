import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { dribbbleConfigured, dribbbleUnavailableReason, buildAuthorizeUrl } from "@/lib/portfolio/dribbble";

export const runtime = "nodejs";

const STATE_COOKIE = "dribbble_oauth_state";

// GET /api/portfolio/dribbble/start -> redirects to Dribbble's authorize
// screen. The state value is round-tripped through a short-lived httpOnly
// cookie (not the DB — it's meaningless the moment the callback returns)
// and checked on the way back, so a callback request that didn't originate
// from this redirect can't complete a connection.
export async function GET(req: Request) {
  const { error } = await requireUser();
  if (error) return error;

  if (!dribbbleConfigured()) {
    return NextResponse.json({ error: dribbbleUnavailableReason() }, { status: 503 });
  }

  const state = randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // the whole OAuth round trip has ten minutes to complete
  });

  const origin = new URL(req.url).origin;
  return NextResponse.redirect(buildAuthorizeUrl(origin, state));
}
