"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// getApps() guard — Next's dev server can re-evaluate this module on fast
// refresh, and initializeApp() throws on a second call with the same config.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * `initializeAuth` rather than `getAuth`, purely to force **localStorage**
 * persistence instead of Firebase's browser default of IndexedDB. That
 * default is what broke sign-in here, and the mechanism is worth writing
 * down because nothing about the symptom points at persistence:
 *
 * `IndexedDBLocalPersistence` registers a `visibilitychange` listener; when
 * the tab reports `hidden` it sets an internal `isHiding` flag and *closes
 * the database*. Opening the Google sign-in popup is exactly such a
 * visibility change. When the popup then completes, Firebase immediately
 * writes the new auth state — and if that write lands before the `visible`
 * event has reset the flag, `_openDb()` throws a bare, uncoded
 * `Error("Database is closing/hidden")`. Its own `_withRetries` explicitly
 * refuses to retry while `isHiding` is set, so there is no recovery: the
 * sign-in itself succeeded, and the result is discarded on the way to disk.
 * (All of this is directly readable in
 * node_modules/@firebase/auth/dist/esm/index-DGK4UgBf.js, ~lines 8247-8350.)
 *
 * Whether the race is lost depends on event ordering, which is stable per
 * machine — hence "fails every single time" for one user and "works fine"
 * for another. `browserLocalPersistence` has no visibility handling of any
 * kind, so the failure mode cannot occur. The trade is that localStorage is
 * synchronous and slightly smaller, which is irrelevant for one auth token.
 *
 * `browserPopupRedirectResolver` must be passed explicitly here: `getAuth`
 * installs it for you, `initializeAuth` does not, and without it
 * `signInWithPopup` fails outright.
 */
function createAuth() {
  // Both options below are browser-only implementations. This module is
  // imported by a Client Component, which Next still evaluates on the server
  // while prerendering /login — handing them to `initializeAuth` there trips
  // a Firebase internal assertion ("Expected a class definition"). Nothing
  // signs in during a prerender, so the plain instance is all that's needed.
  if (typeof window === "undefined") {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Already initialized — the dev server re-evaluated this module on a
    // fast refresh. The existing instance already has the config above.
    return getAuth(app);
  }
}

const auth = createAuth();

/** Thrown for the Firebase-internal race described in `signInWithGoogle`.
 *  Carries a plain-language message because it reaches the user verbatim. */
export class RetryableSignInError extends Error {
  constructor() {
    super("That didn't go through — press Continue with Google once more.");
    this.name = "RetryableSignInError";
  }
}

/**
 * Google sign-in, returning the Firebase ID token for the server to verify.
 *
 * Popup only. Two things this deliberately does NOT do, both learned the
 * hard way against this exact environment:
 *
 * 1. **No `signInWithRedirect` fallback.** It needs its state to survive a
 *    top-level navigation to Google and back through
 *    `<project>.firebaseapp.com`'s auth-handler page, and on localhost that
 *    round trip was verified live to never complete: `getRedirectResult()`
 *    returned `null` on every attempt despite the browser genuinely leaving
 *    and returning, with no exception thrown anywhere — a silent dead end
 *    that looks exactly like "nothing happened."
 * 2. **No automatic retry of the popup from inside this catch.** Browsers
 *    only allow `window.open` synchronously inside a real user gesture. By
 *    the time an `await` has resumed in a catch block, that gesture is
 *    spent, so the retry itself is refused with `auth/popup-blocked` —
 *    confirmed live: the retry, not the original call, is what got blocked.
 *    The next genuine click is the only thing that can legally open another
 *    popup, so the honest move is to ask for one.
 */
export async function signInWithGoogle(): Promise<string> {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user.getIdToken();
  } catch (err) {
    // Firebase Auth's internal IndexedDB persistence layer throws this exact
    // raw Error (uncoded — not an `auth/*` string, verified in
    // node_modules/firebase/firebase-auth-compat.js's `_openDb`) when the
    // popup steals window focus at the instant it's writing to IndexedDB,
    // flipping `document.visibilityState` to "hidden" mid-write. A one-off
    // timing fluke in Firebase's own SDK — the sign-in itself was fine, so
    // the user gets a plain "try once more" rather than a raw SDK string.
    if (err instanceof Error && err.message.includes("Database is closing/hidden")) {
      throw new RetryableSignInError();
    }
    // Everything else — popup blocked outright, the user closed it, a second
    // call cancelling the first — is either a real signal to respect or a
    // structural block, surfaced as-is to the caller's error handling.
    throw err;
  }
}

export async function signOutOfFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

export { auth };
