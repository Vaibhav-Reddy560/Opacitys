import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, newExpiry, signToken, verifyToken, type SessionKind, type SessionPayload } from "./token";

export async function createSession(userId: string, kind: SessionKind): Promise<void> {
  const exp = newExpiry();
  const token = signToken({ userId, kind, exp });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(exp * 1000),
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * The auth preamble every API route needs, collapsed to one call. With the
 * guest kind gone there is only one failure case left (no session at all),
 * but this stays a named helper rather than an inline check so a route
 * missing it is structurally visible in a review/grep, not just implied.
 */
export async function requireUser(): Promise<
  { session: SessionPayload; error: null } | { session: null; error: NextResponse }
> {
  const session = await readSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Sign in to use this." }, { status: 401 }),
    };
  }
  return { session, error: null };
}
