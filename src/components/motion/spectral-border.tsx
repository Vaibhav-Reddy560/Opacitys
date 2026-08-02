"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

/**
 * A slowly rotating conic-gradient ring, masked down to a hairline border.
 * Same mask-composite technique as `.edge-highlight` in globals.css, just as
 * a live rotating conic gradient instead of a static linear one — for states
 * that should read as "active" or "selected" rather than merely present.
 */
export function SpectralBorder({
  children,
  className,
  active = true,
  speed = 6,
  width = 1.5,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  speed?: number;
  width?: number;
}) {
  return (
    <span className={cn("relative isolate inline-block rounded-[inherit]", className)}>
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-[inherit] animate-[spin_var(--spectral-speed)_linear_infinite]"
          style={{
            background: `conic-gradient(${SPECTRUM_GRADIENT}, oklch(0.62 0.22 295))`,
            ["--spectral-speed" as string]: `${speed}s`,
            padding: width,
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      )}
      {children}
    </span>
  );
}
