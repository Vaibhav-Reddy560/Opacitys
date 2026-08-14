"use client";

import Link from "next/link";
import { Menu, X, Settings, ArrowLeft } from "lucide-react";
import { TitleImage } from "@/components/brand/title-image";
import { AccountMenu } from "./account-menu";

interface NavUser {
  name: string | null;
  email: string;
  image: string | null;
}

/**
 * The studio's top bar — the wordmark and account controls, both moved here
 * out of the sidebar so the sidebar is just navigation. Mirrors the landing
 * page's SiteNav (full-width, fixed height, blurred background) rather than
 * inventing a second visual language for the same wordmark.
 *
 * Right-side order, deliberately: Back to site (a real pill button, not a
 * bare text link — it reads as an action, which it is) → Settings (its own
 * icon-linked destination, not folded into the account menu, since it's
 * about the app rather than the identity) → the account menu (avatar only;
 * email and sign out live inside it, not spelled out in the bar at all
 * times — see account-menu.tsx for why no dropdown primitive was reused,
 * there isn't one in this codebase yet).
 *
 * `open`/`onToggle` are owned by the parent (StudioShell): this bar's
 * hamburger button and the sidebar's mobile drawer are two views of the same
 * boolean, so the state has to live above both rather than in either.
 */
export function StudioNav({
  user,
  hasSession,
  open,
  onToggle,
}: {
  user: NavUser | null;
  hasSession: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-white/[0.07] bg-background/85 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        <Link href="/studio" aria-label="Opacitys home" className="h-[26px] shrink-0">
          <TitleImage width={1200} height={158} className="h-[26px] w-auto" size="compact" priority />
        </Link>

        {/* Desktop: pill button, settings icon, account avatar. */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3.5 py-1.5 text-[12.5px] text-foreground/70 transition-colors hover:border-white/20 hover:text-foreground/95"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to site
          </Link>

          <Link
            href="/studio/settings"
            aria-label="Settings"
            title="Settings"
            className="grid size-9 place-items-center rounded-full border border-white/[0.09] text-foreground/62 transition-colors hover:border-white/20 hover:text-foreground/90"
          >
            <Settings className="size-4" aria-hidden />
          </Link>

          <AccountMenu user={user} hasSession={hasSession} />
        </div>

        {/* Mobile: a single toggle opens the sidebar as a drawer, which now
            carries the module list, Settings, AND (below it) the identity +
            sign-out controls, rather than fitting all of that in the bar
            itself at phone width. */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] lg:hidden"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
    </header>
  );
}
