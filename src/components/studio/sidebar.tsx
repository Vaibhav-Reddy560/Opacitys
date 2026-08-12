"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Aperture,
  Layers,
  ScanEye,
  TrendingUp,
  Route as RouteIcon,
  Wrench,
  MessagesSquare,
  Fingerprint,
  Compass,
  Scale,
  Menu,
  X,
  LogOut,
  LibraryBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TitleImage } from "@/components/brand/title-image";
import { PrismIcon } from "@/components/brand/prism";
import { MODULES, STATUS_LABEL } from "@/lib/copy";
import { META_ACCENT, moduleAccent } from "@/lib/critique/spectrum";
import { signOut } from "@/lib/auth/actions";
import { signOutOfFirebase } from "@/lib/firebase/client";

interface SidebarUser {
  name: string | null;
  email: string;
  image: string | null;
}

const ICONS: Record<string, typeof Layers> = {
  critique: ScanEye,
  rebuild: Layers,
  identify: Aperture,
  trends: TrendingUp,
  workflow: RouteIcon,
  tools: Wrench,
  translate: MessagesSquare,
  originality: Compass,
  profile: Fingerprint,
  rights: Scale,
};

export function StudioSidebar({ user, hasSession }: { user: SidebarUser | null; hasSession: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    // Firebase's own client session has to be cleared explicitly — our
    // cookie (destroyed by the signOut server action below) is what every
    // route actually checks, but leaving the Firebase side signed in would
    // let a future Google-button click silently re-auth as the same account
    // with no picker shown.
    await signOutOfFirebase();
    await signOut();
  }

  return (
    <>
      {/* Mobile bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.07] bg-background/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link href="/studio" className="h-6 shrink-0 mt-1">
          {/* Explicit width AND height (both fixed, precomputed from the
              file's true 2400:357 ratio — sharp-verified), not h-6/w-auto.
              Auto-sizing depends on the browser resolving aspect ratio from
              the <img>'s width/height ATTRIBUTES correctly in whatever flex
              context it's rendered in; pinning both dimensions removes that
              dependency entirely; no ambiguity left for any parent's
              flex/stretch behavior to interact with. */}
          <TitleImage width={1200} height={179} className="h-6 w-[161px]" size="compact" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03]"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      <aside
        className={cn(
          "z-30 w-full shrink-0 border-white/[0.07] lg:sticky lg:top-0 lg:block lg:h-svh lg:w-[248px] lg:border-r",
          open ? "block border-b" : "hidden",
        )}
      >
        <div className="flex h-full flex-col p-4">
          {/* self-start: this div is `flex flex-col` with no items- override,
              so default align-items:stretch force-stretches every direct
              child to the column's full width — wanted for the nav rows
              below (their hover background needs to span full width), wrong
              here.
              Width AND height both explicit (precomputed from the file's
              true 2400:357 ratio), not h-8/w-auto — removes any dependency
              on the browser's own aspect-ratio-from-attributes auto-sizing.
              188px, not the ratio-correct value for h-8 (215px), because 215
              doesn't fit: this aside is a fixed 248px, minus p-4 (16px/side)
              on the column and px-2 (8px/side) on this Link leaves 200px of
              actual available width, and 215 > 200 would overflow — same
              failure mode as before, just moved from "wrong ratio" to
              "right ratio, wrong box." 188 clears it with 12px to spare. */}
          <Link href="/studio" className="mb-12 hidden h-[28px] self-start px-2 pt-6 lg:block">
            <TitleImage width={1200} height={179} className="h-[28px] w-[188px]" size="compact" />
          </Link>

          <Link
            href="/studio/library"
            onClick={() => setOpen(false)}
            data-cursor-accent={META_ACCENT}
            className={cn(
              "group relative mb-3 flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
              pathname.startsWith("/studio/library")
                ? "bg-white/[0.06] text-foreground"
                : "text-foreground/62 hover:bg-white/[0.03] hover:text-foreground/90",
            )}
          >
            {pathname.startsWith("/studio/library") && (
              <span
                aria-hidden
                className="absolute inset-y-1.5 left-0 w-[2px] rounded-full"
                style={{ background: META_ACCENT, boxShadow: `0 0 10px ${META_ACCENT}` }}
              />
            )}
            <PrismIcon accent={META_ACCENT} size={28} className="shrink-0">
              <LibraryBig className="size-3.5 shrink-0" aria-hidden />
            </PrismIcon>
            <span className="flex-1">Your work</span>
          </Link>

          <div className="mb-3 border-t border-white/[0.07]" />

          <nav className="flex-1 space-y-0.5">
            {MODULES.map((m) => {
              const Icon = ICONS[m.slug] ?? Layers;
              const active = pathname === m.href || pathname.startsWith(m.href + "/");
              const accent = moduleAccent(m);
              return (
                <Link
                  key={m.slug}
                  href={m.href}
                  onClick={() => setOpen(false)}
                  // On the row, not just the PrismIcon inside it — otherwise
                  // the cursor only picks up the module's colour over the
                  // small circle, and stays rainbow across the rest of the
                  // row you are actually hovering. See custom-cursor.tsx.
                  data-cursor-accent={accent}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
                    active
                      ? "bg-white/[0.06] text-foreground"
                      : "text-foreground/62 hover:bg-white/[0.03] hover:text-foreground/90",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-[2px] rounded-full"
                      style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
                    />
                  )}
                  <PrismIcon accent={accent} size={28} className="shrink-0">
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                  </PrismIcon>
                  <span className="flex-1">{m.name}</span>
                  {m.status !== "live" && (
                    <span
                      className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-foreground/50"
                      title={STATUS_LABEL[m.status]}
                    >
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2.5 border-t border-white/[0.07] pt-4">
            {user && (
              <div className="flex items-center gap-2.5 px-2.5 py-1">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Google avatar URL, not in next.config's image domains
                  <img src={user.image} alt="" className="size-6 shrink-0 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[10px] text-foreground/62">
                    {(user.name ?? user.email)[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] text-foreground/85">{user.name ?? user.email}</p>
                  {user.name && <p className="truncate text-[10.5px] text-foreground/48">{user.email}</p>}
                </div>
              </div>
            )}

            <Link
              href="/"
              className="block px-2.5 py-1.5 text-[12.5px] text-foreground/52 transition-colors hover:text-foreground/85"
            >
              Back to site
            </Link>

            {hasSession && (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-foreground/52 transition-colors hover:bg-white/[0.03] hover:text-foreground/85"
              >
                <LogOut className="size-3.5" aria-hidden />
                Sign out
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
