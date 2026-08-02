"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePointerSpot } from "@/lib/use-pointer-spot";

type Variant = "chrome" | "ghost" | "spectral";

/**
 * Chrome button with a pointer-tracked specular highlight.
 *
 * The highlight position comes from CSS vars written by usePointerSpot, not
 * React state — see that hook for why. `motion` is deliberately not used here:
 * a spring on a button that may appear a dozen times per page is not worth the
 * per-frame cost when a CSS transition is indistinguishable.
 */
export function ChromeButton({
  children,
  onClick,
  variant = "chrome",
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const ref = usePointerSpot<HTMLButtonElement>();

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative isolate overflow-hidden rounded-full px-7 py-3",
        "text-sm tracking-tight",
        "transition-transform duration-200 active:scale-[0.985]",
        "disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        variant === "chrome" && "text-[oklch(0.16_0.014_265)]",
        variant === "ghost" && "text-foreground/80 hover:text-foreground",
        variant === "spectral" && "text-foreground",
        className,
      )}
      style={{ fontVariationSettings: '"wght" 550' }}
    >
      {variant === "chrome" && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "linear-gradient(168deg, oklch(0.99 0.004 240) 0%, oklch(0.9 0.008 250) 24%, oklch(0.78 0.012 255) 48%, oklch(0.86 0.01 252) 66%, oklch(0.98 0.006 245) 100%)",
          }}
        />
      )}
      {variant === "ghost" && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full border border-white/12 bg-white/[0.03]"
        />
      )}
      {variant === "spectral" && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 -z-20"
            style={{
              backgroundImage:
                "linear-gradient(96deg, oklch(0.62 0.22 295), oklch(0.62 0.2 265), oklch(0.75 0.15 205), oklch(0.78 0.17 165), oklch(0.85 0.16 95), oklch(0.75 0.17 55), oklch(0.66 0.22 15))",
            }}
          />
          <span
            aria-hidden
            className="absolute inset-[1.5px] -z-10 rounded-full bg-[oklch(0.185_0.014_265)]"
          />
        </>
      )}

      {/* Specular follows --spot-x/--spot-y; opacity gated on --spot-on. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          opacity: "var(--spot-on, 0)",
          background: `radial-gradient(120px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${
            variant === "chrome" ? "oklch(1 0 0 / 0.9)" : "oklch(0.85 0.16 250 / 0.24)"
          }, transparent 62%)`,
        }}
      />

      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>

      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.38), transparent)",
        }}
      />
    </button>
  );
}
