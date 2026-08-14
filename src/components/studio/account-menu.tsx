"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { signOutOfFirebase } from "@/lib/firebase/client";

interface MenuUser {
  name: string | null;
  email: string;
  image: string | null;
}

/**
 * The avatar in the top-right corner — click it to see the email and sign
 * out, rather than showing name/email inline in the bar at all times. No
 * dropdown/popover primitive exists yet in this codebase (checked — no
 * Radix, no hand-rolled one elsewhere), so this is a small self-contained
 * one: open state plus a click-outside listener, matching how the rest of
 * this app builds its own UI primitives directly rather than reaching for a
 * library for one menu.
 */
export function AccountMenu({ user, hasSession }: { user: MenuUser | null; hasSession: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    await signOutOfFirebase();
    await signOut();
  }

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="block rounded-full outline-none ring-white/20 ring-offset-2 ring-offset-background focus-visible:ring-2"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not in next.config's image domains
          <img src={user.image} alt="" className="size-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[12px] text-foreground/75">
            {(user.name ?? user.email)[0]?.toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] w-64 rounded-xl border border-white/[0.09] bg-background/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2.5 px-1 pb-3">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not in next.config's image domains
              <img src={user.image} alt="" className="size-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[12px] text-foreground/75">
                {(user.name ?? user.email)[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              {user.name && <p className="truncate text-[13px] text-foreground/90">{user.name}</p>}
              <p className="truncate text-[12px] text-foreground/52">{user.email}</p>
            </div>
          </div>

          {hasSession && (
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg border-t border-white/[0.08] px-2.5 py-2 pt-3 text-left text-[13px] text-foreground/70 transition-colors hover:text-foreground/95"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
