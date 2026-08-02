// Deliberately has no `server-only` guard and no `next/headers` import.
// src/proxy.ts needs to verify a session cookie's signature on every
// request, and per the Next 16 auth guide that check has to be optimistic
// and cheap — cookie in, verified payload out, no database. Keeping this
// file framework-agnostic is what lets both the proxy and session.ts
// (which *does* touch next/headers) share one implementation instead of
// duplicating the signing logic.
import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionKind = "user" | "guest";

export interface SessionPayload {
  userId: string;
  kind: SessionKind;
  /** Unix seconds. */
  exp: number;
}

export const SESSION_COOKIE = "opacitys_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set. Add it to the production environment before starting a session — " +
        "generate one with `openssl rand -base64 32`.",
    );
  }

  // Dev-only fallback so `npm run dev` works without extra setup. The check
  // above refuses to run without a real secret anywhere but here.
  console.warn(
    "[auth] SESSION_SECRET is not set — using a fixed development-only key. " +
      "Add SESSION_SECRET to .env.local before deploying.",
  );
  return "dev-only-insecure-session-secret-do-not-use-in-production";
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export function newExpiry(): number {
  return Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
}

export function signToken(payload: SessionPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payloadB64));

  // Length has to match before timingSafeEqual will even accept the
  // buffers — a mismatch here is just "not valid," not a crash.
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as SessionPayload;
    const validKind = payload.kind === "user" || payload.kind === "guest";
    if (typeof payload.userId !== "string" || !validKind) return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
