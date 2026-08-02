"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePointerSpot } from "@/lib/use-pointer-spot";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

/**
 * Prismatic chrome element system.
 *
 * These carry the material beyond the background so the effect reads as a
 * design language rather than one hero trick. All of them are pure CSS —
 * gradients, blend modes and CSS vars — so they cost nothing per frame. The
 * WebGL layer stays reserved for full-bleed backgrounds only.
 */

/**
 * A chrome bezel ring holding an icon — the standard module/feature marker.
 *
 * Circular throughout — bezel, face and glow. The previous version put a
 * circular radial glow inside a rounded-*square* bezel, which left the
 * corners outside the glow's reach permanently dark; a real machined bezel
 * (a watch case, a lens ring) is circular for the same reason: a round light
 * source has nowhere to hide in a round frame.
 *
 * The bezel is a conic gradient rather than linear, so it reads as a ring
 * with a travelling highlight rather than a flat two-tone edge — and the
 * highlight visibly sweeps around it on hover, entirely in CSS (a single
 * `rotate`, GPU-composited, no JS).
 */
export function PrismIcon({
  children,
  accent,
  size = 44,
  className,
}: {
  children: ReactNode;
  /** Spectral accent for the inner glow. Defaults to full spectrum. */
  accent?: string;
  size?: number;
  className?: string;
}) {
  const border = Math.max(1.5, size * 0.035);

  return (
    <span
      className={cn("group/icon relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Bezel: conic ramp so the highlight reads as travelling around a
          machined ring, not a fixed diagonal split. Idle: slow ambient spin.
          Hover: speeds up — pure CSS, no JS. */}
      <span
        aria-hidden
        className="absolute inset-0 animate-[spin_18s_linear_infinite] rounded-full group-hover/icon:animate-[spin_2.6s_linear_infinite]"
        style={{
          background: `conic-gradient(from 0deg,
            oklch(0.99 0.004 245) 0deg,
            oklch(0.42 0.016 260) 70deg,
            oklch(0.85 0.01 250) 130deg,
            oklch(0.3 0.016 262) 200deg,
            oklch(0.95 0.006 245) 260deg,
            oklch(0.55 0.014 258) 330deg,
            oklch(0.99 0.004 245) 360deg)`,
        }}
      />
      {/* Face */}
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          inset: border,
          background:
            "radial-gradient(120% 120% at 32% 22%, oklch(0.3 0.018 262) 0%, oklch(0.17 0.014 265) 68%)",
        }}
      />
      {/* Spectral glow — concentric with the face, so there is no unlit
          region for it to fail to reach. */}
      <span
        aria-hidden
        className="absolute rounded-full opacity-50 transition-opacity duration-300 group-hover/icon:opacity-75"
        style={{
          inset: border,
          background: accent
            ? `radial-gradient(85% 85% at 34% 24%, ${accent}, transparent 72%)`
            : `conic-gradient(from 90deg, ${SPECTRUM_GRADIENT})`,
          mixBlendMode: "screen",
        }}
      />
      <span className="relative z-10 text-foreground/92">{children}</span>
    </span>
  );
}

/** Text filled with chrome + a scattered prismatic sheen. For headings. */
export function PrismText({
  children,
  className,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3";
}) {
  return (
    <Tag className={cn("relative inline-block", className)}>
      <span
        className="relative"
        style={{
          backgroundImage:
            "linear-gradient(177deg, oklch(0.99 0.005 245) 0%, oklch(0.80 0.012 252) 34%, oklch(0.66 0.014 258) 50%, oklch(0.90 0.01 248) 72%, oklch(0.74 0.012 254) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
        }}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(108deg, ${SPECTRUM_GRADIENT}, oklch(0.68 0.21 295))`,
          backgroundSize: "260% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
          mixBlendMode: "overlay",
          opacity: 0.42,
        }}
      >
        {children}
      </span>
    </Tag>
  );
}

/** A 1px spectral divider. Thin, quiet, and unmistakably the brand. */
export function PrismRule({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block h-px w-full", className)}
      style={{
        background: `linear-gradient(90deg, transparent, ${SPECTRUM_GRADIENT}, transparent)`,
        opacity: 0.55,
      }}
    />
  );
}

/**
 * An opacity meter — the product's core metaphor as a component. Renders a
 * value from 0-100 as a bar that resolves from transparent to solid chrome.
 */
export function OpacityMeter({
  value,
  accent,
  className,
  showValue = true,
}: {
  value: number;
  accent?: string;
  className?: string;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        {/* Checker hint at low opacity — the visual language of transparency. */}
        <span
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(45deg, oklch(1 0 0 / 0.08) 25%, transparent 25%, transparent 75%, oklch(1 0 0 / 0.08) 75%)",
            backgroundSize: "6px 6px",
          }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: `${pct}%`,
            background: accent
              ? `linear-gradient(90deg, color-mix(in oklch, ${accent} 25%, transparent), ${accent})`
              : "linear-gradient(90deg, oklch(0.55 0.014 258), oklch(0.99 0.005 245))",
          }}
        />
      </span>
      {showValue && (
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/62">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/** Chrome panel with pointer spotlight — the standard content container. */
export function PrismPanel({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  const ref = usePointerSpot<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "surface-chrome edge-highlight relative isolate overflow-hidden rounded-2xl",
        className,
      )}
      style={{
        boxShadow:
          "0 1px 0 0 oklch(1 0 0 / 0.05) inset, 0 22px 54px -30px oklch(0 0 0 / 0.8)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          opacity: "var(--spot-on, 0)",
          background: `radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${
            accent ? `color-mix(in oklch, ${accent} 17%, transparent)` : "oklch(0.85 0.02 250 / 0.1)"
          }, transparent 68%)`,
        }}
      />
      {children}
    </div>
  );
}
