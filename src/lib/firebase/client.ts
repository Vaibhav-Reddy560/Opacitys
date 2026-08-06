"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
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
const auth = getAuth(app);

/**
 * Google sign-in, returning the Firebase ID token for the server to verify.
 * Tries a popup first (no navigation, feels instant); falls back to a full
 * redirect when the popup is blocked or closed, which is common on Safari
 * and any browser with a strict popup blocker.
 */
export async function signInWithGoogle(): Promise<string> {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user.getIdToken();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      // Redirect navigates away — nothing after this line runs. The
      // redirect result is picked up by getRedirectResult() on the page
      // that receives the callback (see google-button.tsx).
      return new Promise(() => {});
    }
    throw err;
  }
}

export async function signOutOfFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

export { auth };
