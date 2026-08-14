"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  LogOut,
  LibraryBig,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrismIcon } from "@/components/brand/prism";
import { MODULES, STATUS_LABEL } from "@/lib/copy";
import { META_ACCENT, moduleAccent } from "@/lib/critique/spectrum";
import { signOut } from "@/lib/auth/actions";
import { signOutOfFirebase } from "@/lib/firebase/client";
import { StylesToday } from "./styles-today";
import { NewsPopover } from "./news-popover";
import type { DailyStyleItem, DailyNewsItem } from "@/lib/digest/read";

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

/**
 * Pure navigation now — the wordmark and account controls both moved to
 * StudioNav (the top bar), which is what makes this just a list of places to
 * go rather than also being an identity/branding surface. On mobile it is
 * StudioNav's drawer, so it carries a compact copy of the account controls
 * at its own foot: there's no room for those in the collapsed mobile top
 * bar, so "in the nav system" means "in the drawer the nav's hamburger
 * opens" at that width, and inline in the bar itself at desktop width.
 */
export function StudioSidebar({
  user,
  hasSession,
  open,
  onNavigate,
  styles,
  stylesUnseen,
  news,
  newsUnseen,
}: {
  user: SidebarUser | null;
  hasSession: boolean;
  open: boolean;
  onNavigate: () => void;
  styles: DailyStyleItem[];
  stylesUnseen: boolean;
  news: DailyNewsItem[];
  newsUnseen: boolean;
}) {
  const pathname = usePathname();

  async function handleSignOut() {
    await signOutOfFirebase();
    await signOut();
  }

  return (
    <aside
      className={cn(
        "z-30 w-full shrink-0 border-white/[0.07] lg:sticky lg:top-16 lg:block lg:h-[calc(100svh-4rem)] lg:w-[248px] lg:border-r",
        open ? "block border-b" : "hidden",
      )}
    >
      <div className="flex h-full flex-col p-4">
        <Link
          href="/studio/library"
          onClick={onNavigate}
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

        <nav className="space-y-0.5">
          {MODULES.map((m) => {
            const Icon = ICONS[m.slug] ?? Layers;
            const active = pathname === m.href || pathname.startsWith(m.href + "/");
            const accent = moduleAccent(m);
            return (
              <Link
                key={m.slug}
                href={m.href}
                onClick={onNavigate}
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

        <StylesToday items={styles} unseen={stylesUnseen} />

        {/* Mobile-only: StudioNav shows this inline at lg, so repeating it
            in the always-lg-hidden drawer would be a literal duplicate. News
            is the one exception — StudioNav's popover is desktop-only real
            estate, so it gets a row here too for mobile parity. */}
        <div className="mt-4 space-y-2.5 border-t border-white/[0.07] pt-4 lg:hidden">
          {news.length > 0 && (
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[12.5px] text-foreground/52">Design news</span>
              <NewsPopover items={news} unseen={newsUnseen} />
            </div>
          )}
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
            href="/studio/settings"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-foreground/52 transition-colors hover:bg-white/[0.03] hover:text-foreground/85"
          >
            <SettingsIcon className="size-3.5" aria-hidden />
            Settings
          </Link>

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
  );
}
