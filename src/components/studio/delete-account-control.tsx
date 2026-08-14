"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { deleteAccount } from "@/lib/auth/actions";

/**
 * Deleting an account is a different order of destructive than deleting one
 * asset (see library/delete-button.tsx, which is right to use a plain
 * browser confirm() for that) — this removes every asset, analysis, and
 * record the user has, all at once, with no undo. A native confirm() is too
 * easy to click through for that; typing the account's own email back is
 * the standard weight for this specific action across real products, and
 * cheap to implement without a modal library this app doesn't otherwise use.
 */
export function DeleteAccountControl({ email }: { email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/[0.06] px-4 py-2 text-[13px] text-red-300/90 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        Delete account
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4">
      <p className="text-[13px] leading-relaxed text-foreground/80">
        This permanently deletes your account and everything in it — every upload, analysis, and saved result.
        There is no undo. Type <span className="text-foreground/95">{email}</span> to confirm.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={email}
        autoComplete="off"
        spellCheck={false}
        className="mt-3 w-full rounded-lg border border-white/[0.09] bg-black/25 px-3 py-2 text-[13px] text-foreground/90 placeholder:text-foreground/30 focus:border-red-500/40 focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          disabled={!matches || pending}
          onClick={() => startTransition(() => deleteAccount())}
          className="inline-flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-2 text-[13px] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-500/90"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
          {pending ? "Deleting…" : "Permanently delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
          disabled={pending}
          className="text-[13px] text-foreground/55 transition-colors hover:text-foreground/85"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
