"use server";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSession, destroySession } from "./session";

export interface AuthActionState {
  error: string | null;
}

const NO_DATABASE_MESSAGE =
  "Accounts need a connected database, and this one is not connected yet — use \"Continue without an account\" below in the meantime.";

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// `next` comes back from the client as a plain form field, so it has to be
// re-validated server-side: a crafted signup/login link with next=https://
// evil.example would otherwise turn this into an open redirect off a page
// that is, by design, meant to be linkable from anywhere.
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next === "string" && next.startsWith("/studio")) return next;
  return "/studio";
}

export async function signUp(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || password.length < 8) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  let userId: string;
  try {
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing[0]) {
      return { error: "An account with that email already exists — try signing in instead." };
    }
    const [created] = await db
      .insert(schema.users)
      .values({ email, passwordHash: hashPassword(password) })
      .returning({ id: schema.users.id });
    userId = created.id;
  } catch {
    // Deliberate: no DATABASE_URL is a genuine, expected state for this app
    // right now (see src/lib/db/index.ts) — reporting it plainly beats a
    // form that silently pretends to have created an account.
    return { error: NO_DATABASE_MESSAGE };
  }

  await createSession(userId, "user");
  redirect(next);
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  let row: { id: string; passwordHash: string | null } | undefined;
  try {
    const rows = await db
      .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    row = rows[0];
  } catch {
    return { error: NO_DATABASE_MESSAGE };
  }

  if (!row || !row.passwordHash || !verifyPassword(password, row.passwordHash)) {
    return { error: "That email and password do not match." };
  }

  await createSession(row.id, "user");
  redirect(next);
}

// Deliberately does not touch the database. A guest session only needs a
// unique id to carry — inserting a row would make the one path that is
// supposed to work with no DATABASE_URL depend on having one. The honest
// cost of that: a guest id isn't backed by a real user row, so it gates
// navigation into the studio, not per-user data — there is none to isolate
// yet, and this is the same wall every module's backend will eventually
// need to cross.
export async function continueAsGuest(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  await createSession(`guest-${randomUUID()}`, "guest");
  redirect(next);
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
