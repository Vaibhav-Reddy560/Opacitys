"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Newspaper, ArrowUpRight } from "lucide-react";
import { markDigestSeen } from "@/lib/digest/actions";
import { META_ACCENT } from "@/lib/critique/spectrum";
import type { DailyNewsItem } from "@/lib/digest/read";

/**
 * The navbar's news icon, between "Back to site" and Settings — mirrors
 * account-menu.tsx's exact self-contained popover pattern (ref +
 * pointerdown/Escape close, no external dropdown primitive; see that
 * component's own doc comment for why nothing is reused from a library).
 * Unlike the sidebar's StylesToday (always visible, marked seen
 * server-side the moment studio/layout.tsx renders it), this is hidden
 * behind a click, so it only marks itself seen when actually opened.
 */
export function NewsPopover({ items, unseen }: { items: DailyNewsItem[]; unseen: boolean }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
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

  function toggle() {
    const next = !open;
    setOpen(next);
    // Outside the setOpen call, not inside its updater — React runs a
    // functional updater as part of processing the state update itself, so
    // triggering another update (startTransition, which markDigestSeen's
    // "use server" call schedules) from within one is exactly the "cannot
    // update a component while rendering a different component" violation.
    if (next && unseen) startTransition(() => markDigestSeen("news"));
  }

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Design news"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-full border border-white/[0.09] text-foreground/62 transition-colors hover:border-white/20 hover:text-foreground/90"
      >
        <Newspaper className="size-4" aria-hidden />
        {unseen && (
          <span
            aria-hidden
            className="absolute right-1 top-1 size-2 rounded-full ring-2 ring-background"
            style={{ background: META_ACCENT, boxShadow: `0 0 6px ${META_ACCENT}` }}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] w-80 rounded-xl border border-white/[0.09] bg-background/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <p className="px-1 pb-2 text-[10px] uppercase tracking-[0.14em] text-foreground/45">Design news today</p>
          <ul className="space-y-3">
            {items.slice(0, 5).map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="text-[13px] leading-snug text-foreground/88"
                      style={{ fontVariationSettings: '"wght" 550' }}
                    >
                      {item.title}
                    </p>
                    <ArrowUpRight
                      className="mt-0.5 size-3.5 shrink-0 text-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-foreground/55">{item.summary}</p>
                  <p className="mt-1 text-[10.5px] text-foreground/40">{item.source}</p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
