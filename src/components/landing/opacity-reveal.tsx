"use client";

import { useId, useRef } from "react";
import { motion, useMotionValue, useTransform, useReducedMotion } from "motion/react";
import { SPECTRUM, DIMENSION_ORDER } from "@/lib/critique/spectrum";

/**
 * Signature interaction A — the product thesis made physical.
 *
 * Drag the handle and a poster resolves from a faint, blurred sketch to a
 * fully finished piece: an editorial grid, then a light body carrying the
 * spectral palette, then a real lockup, then a chrome finishing pass — each
 * fading in at its own threshold, with the whole composition sharpening
 * (blur -> 0) as the value climbs. This is what Opacitys does to a design,
 * shown rather than described — which only works if what it resolves *into*
 * is a piece a studio would actually ship, not placeholder geometry.
 *
 * All motion runs on Motion's motion values (useMotionValue/useTransform),
 * not React state — dragging never re-renders this component. The live "38%"
 * readout is a MotionValue passed directly as a motion.span's children,
 * which Motion subscribes to and writes as text without a re-render either.
 */
export function OpacityReveal() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const pct = useMotionValue(34);
  const roundedPct = useTransform(pct, (v) => Math.round(v));

  // Scoped per instance so a second OpacityReveal on the page (there isn't
  // one today, but nothing stops there being one) doesn't share a gradient.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `or-light-${uid}`;
  const barId = `or-bar-${uid}`;

  const leftPct = useTransform(pct, (v) => `${v}%`);
  // The round handle is centred on this position via -translate-x-1/2, so at
  // the true edges (0/100) half of it would sit outside the track's
  // overflow-hidden bounds and get clipped. Only the handle's own position
  // is clamped in from the edge — the divider line and the fill still read
  // the true, unclamped value.
  const handleLeftPct = useTransform(pct, (v) => `${Math.min(97, Math.max(3, v))}%`);
  const blur = useTransform(pct, [0, 100], [7, 0]);
  const filterMv = useTransform(blur, (b) => `blur(${b}px)`);
  const baseOpacity = useTransform(pct, [0, 100], [0.5, 1]);

  const gridOpacity = useTransform(pct, [10, 34], [0, 1]);
  const bodyOpacity = useTransform(pct, [28, 56], [0, 1]);
  const typeOpacity = useTransform(pct, [52, 78], [0, 1]);
  const finishOpacity = useTransform(pct, [74, 100], [0, 1]);

  const setFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const v = ((clientX - rect.left) / rect.width) * 100;
    pct.set(Math.max(0, Math.min(100, v)));
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <div
        ref={trackRef}
        className="relative aspect-[4/5] w-full touch-none overflow-hidden rounded-2xl border border-white/[0.09] bg-black/50 select-none"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setFromClientX(e.clientX);
        }}
      >
        <motion.div
          style={{ filter: reduce ? undefined : filterMv, opacity: reduce ? 1 : baseOpacity }}
          className="absolute inset-0"
        >
          {/* Layer 0 — the faint idea: a sparse hatch, always present */}
          <svg className="absolute inset-0 h-full w-full opacity-[0.22]" viewBox="0 0 300 375">
            {Array.from({ length: 14 }).map((_, i) => (
              <line
                key={i}
                x1={i * 24 - 40}
                y1="0"
                x2={i * 24 - 40 + 375}
                y2="375"
                stroke="white"
                strokeWidth="0.6"
              />
            ))}
          </svg>

          {/* Layer 1 — an editorial grid: margin box, four columns on their
              gutters, five baseline rules. What a layout is actually built
              on, not three arbitrary lines each way. */}
          <motion.svg
            style={{ opacity: gridOpacity }}
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 300 375"
          >
            <rect
              x="20"
              y="20"
              width="260"
              height="335"
              fill="none"
              stroke="white"
              strokeOpacity="0.28"
              strokeWidth="0.75"
            />
            {[83, 150, 217].map((x) => (
              <line
                key={x}
                x1={x}
                y1="20"
                x2={x}
                y2="355"
                stroke="white"
                strokeOpacity="0.2"
                strokeWidth="0.6"
              />
            ))}
            {[76, 132, 188, 243, 299].map((y) => (
              <line
                key={y}
                x1="20"
                y1={y}
                x2="280"
                y2={y}
                stroke="white"
                strokeOpacity="0.2"
                strokeWidth="0.6"
              />
            ))}
          </motion.svg>

          {/* Layer 2 — a light body: a lit sphere inside a chrome hairline
              ring, one offset ring overlapping it, and a spectral accent bar.

              The radial runs cyan -> blue -> violet OUTWARD, so the bright
              point sits where the light source is and violet only appears as
              rim falloff. Reversed (violet innermost) it put a saturated
              purple blob in the middle of a blue circle, which read as a
              bruise rather than as lighting. */}
          <motion.svg
            style={{ opacity: bodyOpacity }}
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 300 375"
          >
            <defs>
              <radialGradient id={gradId} cx="36%" cy="30%" r="78%">
                <stop offset="0%" stopColor={SPECTRUM.typography.color} stopOpacity="0.92" />
                <stop offset="46%" stopColor={SPECTRUM.color.color} stopOpacity="0.6" />
                <stop offset="100%" stopColor={SPECTRUM.hierarchy.color} stopOpacity="0.16" />
              </radialGradient>
              <linearGradient id={barId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={SPECTRUM.hierarchy.color} />
                <stop offset="50%" stopColor={SPECTRUM.typography.color} />
                <stop offset="100%" stopColor={SPECTRUM.spacing.color} />
              </linearGradient>
            </defs>
            <circle cx="150" cy="150" r="88" fill={`url(#${gradId})`} />
            <circle cx="150" cy="150" r="88" fill="none" stroke="white" strokeOpacity="0.45" />
            <circle
              cx="192"
              cy="116"
              r="56"
              fill="none"
              stroke="white"
              strokeOpacity="0.2"
              strokeWidth="0.75"
            />
            {/* Sits clear of the lockup below. At y=291 this was a flat
                55%-opacity orange running straight through the headline,
                which resolved to a muddy brown block. */}
            <rect x="20" y="250" width="150" height="5" rx="2.5" fill={`url(#${barId})`} opacity="0.9" />
          </motion.svg>

          {/* Layer 3 — a real lockup: what the piece is, numbered, and the
              line it exists to prove. Every line names something the system
              actually is — "Fully Resolved" is the slider's own right-hand
              label, so dragging to 100 makes the poster state its own end
              state. (Earlier drafts read "Field Notes" and then "Light,
              Split", both of which meant nothing.) */}
          <motion.div style={{ opacity: typeOpacity }} className="absolute inset-0 p-6">
            <div className="flex items-start justify-between">
              <span className="text-[9px] uppercase tracking-[0.16em] text-white/55">
                Opacitys
              </span>
              <span className="font-mono text-[9px] text-white/40">001</span>
            </div>
            <div className="absolute bottom-6 left-6 right-6">
              <p
                className="text-[38px] leading-[0.9] text-white"
                style={{ fontVariationSettings: '"wght" 600' }}
              >
                Fully
                <br />
                Resolved
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/50">
                Ten ways to read one image
              </p>
            </div>
          </motion.div>

          {/* Layer 4 — the finish: a diagonal specular sweep, a hairline
              inner chrome rim, and the ten spectral ticks arriving at
              full strength — the same ten dimensions the marquee and the
              spectrum-split diagram use, so the poster ends on the exact
              vocabulary the rest of the page is built from. */}
          <motion.div aria-hidden style={{ opacity: finishOpacity }} className="absolute inset-0">
            <div
              className="absolute inset-0 mix-blend-overlay"
              style={{
                background:
                  "linear-gradient(115deg, oklch(0.99 0.004 240 / 0.5), transparent 40%, transparent 60%, oklch(0.7 0.15 250 / 0.35))",
              }}
            />
            <div
              className="absolute inset-3 rounded-sm"
              style={{ boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.22)" }}
            />
            <div className="absolute bottom-6 right-6 flex flex-col items-center gap-1.5">
              {DIMENSION_ORDER.map((d) => (
                <span
                  key={d}
                  className="h-[3px] w-4 rounded-full"
                  style={{
                    background: SPECTRUM[d].color,
                    boxShadow: `0 0 4px ${SPECTRUM[d].color}`,
                  }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Handle */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px"
          style={{ left: leftPct, background: "oklch(1 0 0 / 0.75)" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/65 backdrop-blur-sm"
          style={{ left: handleLeftPct }}
        >
          <motion.span className="font-mono text-[10.5px] text-white/90 tabular-nums">
            {roundedPct}
          </motion.span>
        </motion.div>
      </div>

      {/* Accessible control — visually a labelled slider, keyboard operable */}
      <label className="mt-5 block">
        <span className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-foreground/52">
          <span>Faint</span>
          <span>Fully resolved</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={34}
          aria-label="Design resolution"
          onChange={(e) => pct.set(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-white"
        />
      </label>
    </div>
  );
}
