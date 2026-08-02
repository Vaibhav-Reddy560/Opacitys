"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChromeButton } from "@/components/ui/chrome-button";
import { signIn, signUp, continueAsGuest, type AuthActionState } from "@/lib/auth/actions";

const INITIAL_STATE: AuthActionState = { error: null };

/**
 * Credential form, wired to the real Server Actions in
 * src/lib/auth/actions.ts. There is a genuine, temporary gap here: those
 * actions write to and read from a database that has no DATABASE_URL set in
 * this environment, so a submitted email/password will surface the "not
 * connected yet" message rather than create an account — see the actions'
 * own catch blocks. "Continue without an account" is the door that works
 * regardless, because it never touches the database at all.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  const [state, formAction, pending] = useActionState(
    mode === "login" ? signIn : signUp,
    INITIAL_STATE,
  );

  const field =
    "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-[13.5px] text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15";

  return (
    <div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="email" className="mb-2 block text-[12px] text-foreground/62">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@studio.com"
            className={field}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-[12px] text-foreground/62">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
            className={field}
          />
        </div>

        <ChromeButton type="submit" disabled={pending} className="w-full justify-center">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              One moment…
            </>
          ) : mode === "login" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </ChromeButton>

        {state.error && (
          <p
            role="status"
            className="text-pretty rounded-xl border border-white/[0.09] bg-white/[0.02] p-3 text-[12.5px] leading-relaxed text-foreground/65"
          >
            {state.error}
          </p>
        )}
      </form>

      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form action={continueAsGuest}>
        <input type="hidden" name="next" value={next} />
        <ChromeButton type="submit" variant="ghost" className="w-full justify-center">
          Continue without an account
        </ChromeButton>
        <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-foreground/48">
          Opens the studio right away. Nothing is saved to a profile — sign up
          later to keep it.
        </p>
      </form>
    </div>
  );
}
