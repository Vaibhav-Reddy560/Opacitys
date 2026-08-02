"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePointerSpot } from "@/lib/use-pointer-spot";

/**
 * Brushed-metal panel with a pointer-tracked spotlight.
 *
 * Spotlight position rides CSS vars (see usePointerSpot) so a grid of these
 * costs zero React renders on mousemove.
 */
export function ChromeCard({
  children,
  className,
  spotlight = true,
  accent,
}: {
  children: ReactNode;
  className?: string;
  spotlight?: boolean;
  /** Optional spectral accent colour for the spotlight tint. */
  accent?: string;
}) {
  const ref = usePointerSpot<HTMLDivElement>();

  return (
    <div
      ref={spotlight ? ref : undefined}
      className={cn(
        "surface-chrome edge-highlight relative isolate overflow-hidden rounded-2xl",
        className,
      )}
      style={{
        boxShadow:
          "0 1px 0 0 oklch(1 0 0 / 0.05) inset, 0 24px 60px -28px oklch(0 0 0 / 0.85)",
      }}
    >
      {spotlight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
          style={{
            opacity: "var(--spot-on, 0)",
            background: `radial-gradient(340px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${
              accent
                ? `color-mix(in oklch, ${accent} 18%, transparent)`
                : "oklch(0.85 0.02 250 / 0.1)"
            }, transparent 68%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}
