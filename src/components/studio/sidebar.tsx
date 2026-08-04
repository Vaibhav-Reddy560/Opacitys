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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TitleImage } from "@/components/brand/title-image";
import { PrismIcon } from "@/components/brand/prism";
import { MODULES, STATUS_LABEL } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { Dimension } from "@/lib/critique/types";
import { signOut } from "@/lib/auth/actions";
import type { SessionKind } from "@/lib/auth/token";

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

export function StudioSidebar({ sessionKind }: { sessionKind: SessionKind | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.07] bg-background/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link href="/studio">
          <TitleImage width={403} height={60} className="h-6 w-[161px] pt-1" />
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
          {/* w-[88%] + h-auto scales the wordmark down proportionally — the
              width/height props carry the PNG's true 6.72:1 ratio, so height
              follows width instead of being pinned independently (pinning one
              axis is what squashed this image in an earlier pass). */}
          <Link href="/studio" className="mb-7 hidden px-2 pt-6 lg:block">
            <TitleImage width={591} height={88} className="w-[88%] h-auto" priority />
          </Link>

          <nav className="flex-1 space-y-0.5">
            {MODULES.map((m) => {
              const Icon = ICONS[m.slug] ?? Layers;
              const active = pathname === m.href || pathname.startsWith(m.href + "/");
              const accent = SPECTRUM[m.dimension as Dimension]?.color;
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
                      {m.status === "partial" ? "WIP" : "Soon"}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2.5 border-t border-white/[0.07] pt-4">
            {sessionKind === "guest" && (
              <div className="flex items-center gap-2 px-2.5">
                <span className="size-1.5 rounded-full bg-[oklch(0.85_0.16_95)]" aria-hidden />
                <span className="text-[11.5px] text-foreground/52">
                  Guest session — nothing is saved to a profile
                </span>
              </div>
            )}

            <Link
              href="/"
              className="block px-2.5 py-1.5 text-[12.5px] text-foreground/52 transition-colors hover:text-foreground/85"
            >
              Back to site
            </Link>

            {sessionKind && (
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-foreground/52 transition-colors hover:bg-white/[0.03] hover:text-foreground/85"
                >
                  <LogOut className="size-3.5" aria-hidden />
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
