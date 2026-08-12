"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChromeButton } from "@/components/ui/chrome-button";
import { signInWithGoogle } from "@/lib/firebase/client";
import { fetchJson } from "@/lib/http";

// Re-validated here too, not just server-side in the old safeNext — this is
// what decides where router.push actually navigates, so it needs the same
// guard against an open-redirect crafted into ?next=.
function safeNext(next: string | null): string {
  if (next && next.startsWith("/studio")) return next;
  return "/studio";
}

function GoogleGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

export function GoogleButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const idToken = await signInWithGoogle();
      await fetchJson("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }, "Could not sign in.");
      router.push(safeNext(searchParams.get("next")));
      router.refresh();
    } catch (err) {
      setPending(false);
      // The inline status text below carries no stack or detail — this is
      // what makes a future "sign-in just fails" report a ten-second console
      // check instead of another multi-turn investigation.
      console.error("[auth] sign-in failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong signing in.");
    }
  }

  return (
    <div>
      <ChromeButton
        onClick={run}
        disabled={pending}
        className="w-full justify-center px-8 py-4 text-[15px]"
      >
        {pending ? (
          <>
            <Loader2 className="size-[18px] animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            <GoogleGlyph className="size-[18px]" />
            Continue with Google
          </>
        )}
      </ChromeButton>

      {error && (
        <p
          role="status"
          className="text-pretty mt-4 rounded-xl border border-white/[0.09] bg-white/[0.02] p-3 text-[12.5px] leading-relaxed text-foreground/65"
        >
          {error}
        </p>
      )}
    </div>
  );
}
