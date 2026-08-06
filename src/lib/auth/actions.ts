"use server";

import { redirect } from "next/navigation";
import { destroySession } from "./session";

// Firebase sign-in itself happens client-side (src/lib/firebase/client.ts)
// and is exchanged for our own session cookie by /api/auth/google — this is
// the one piece of the old email/password flow that's still a plain server
// action, since signing out never needed a client round trip either.
export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
