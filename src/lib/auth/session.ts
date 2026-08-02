import "server-only";
import { cookies } from "next/headers";
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
