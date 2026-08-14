"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { destroySession, readSession } from "./session";

// Firebase sign-in itself happens client-side (src/lib/firebase/client.ts)
// and is exchanged for our own session cookie by /api/auth/google — this is
// the one piece of the old email/password flow that's still a plain server
// action, since signing out never needed a client round trip either.
export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}

/**
 * Permanently deletes the signed-in user's account and everything under it.
 *
 * A single `DELETE FROM users` is sufficient: every table that references
 * `users.id` in the schema does so with `onDelete: "cascade"` (verified by
 * reading schema.ts directly, all 11 references) — assets, analyses,
 * layers, library entries, the designer profile, trend reads, everything.
 * Nothing else needs to be deleted by hand, and nothing is left orphaned.
 *
 * No separate confirmation step here — the UI this is called from owns
 * that (a typed-confirmation dialog), and a server action that deletes
 * everything a user has is exactly the kind of thing that should require
 * the caller to have already made the user unmistakably confirm, not
 * re-litigate it here with a second, weaker check.
 */
export async function deleteAccount(): Promise<void> {
  const session = await readSession();
  if (!session) redirect("/login");

  await db.delete(schema.users).where(eq(schema.users.id, session.userId));
  await destroySession();
  redirect("/");
}
