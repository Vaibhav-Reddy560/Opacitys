import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import {
  dribbbleConfigured,
  exchangeCodeForToken,
  fetchDribbbleHandle,
  saveDribbbleConnection,
  syncDribbbleShots,
} from "@/lib/portfolio/dribbble";

export const runtime = "nodejs";

const STATE_COOKIE = "dribbble_oauth_state";

// GET /api/portfolio/dribbble/callback -> Dribbble redirects here with
// ?code&state. On any failure this redirects back to the profile page with
// ?dribbble=error rather than rendering its own error page — the profile
// page is where the connection state actually lives.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (reason: string) => {
    console.error(`[dribbble] callback failed: ${reason}`);
    return NextResponse.redirect(new URL("/studio/profile?dribbble=error", url.origin));
  };

  const { session, error } = await requireUser();
  if (error) return error;
  if (!dribbbleConfigured()) return fail("not configured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("missing code/state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!expectedState || state !== expectedState) return fail("state mismatch");

  try {
    const accessToken = await exchangeCodeForToken(code, url.origin);
    const handle = await fetchDribbbleHandle(accessToken);
    await saveDribbbleConnection({ userId: session.userId, accessToken, externalHandle: handle });
    // First sync happens inline so the profile page has shots to show
    // immediately, instead of a connected-but-empty state until the next
    // manual sync.
    await syncDribbbleShots(session.userId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }

  return NextResponse.redirect(new URL("/studio/profile?dribbble=connected", url.origin));
}
