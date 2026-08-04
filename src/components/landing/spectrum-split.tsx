"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

/**
 * Signature interaction C — a beam of white light meets a prism and fans
 * into the ten critique dimensions as the section scrolls.
 *
 * GEOMETRY. The previous version fanned rays across too wide an angle for
 * its own viewBox: the outer two (hierarchy/violet, originality/red) exited
 * the visible area entirely, which is why they read as "missing" — they
 * weren't undrawn, they were off-canvas. The fan here (±27° around the
 * horizontal, 9° per band) is sized against the viewBox up front so every
 * ray, and the label past its tip, stays inside it with margin to spare.
 * Labels sit *past* each ray's tip rather than along it — anchoring text
 * along the ray itself (the old approach) put a horizontal string of
 * letters across a diagonal line, which is what was reading as overlap.
 *
 * MOTION. Two independent animations layer on top of the scroll-driven
 * reveal: a highlight that continuously travels the length of the incoming
 * beam, and a soft chase of light down each band once it has resolved. Both
 * are plain CSS (`stroke-dasharray` + `stroke-dashoffset` keyframes), so
 * they cost a paint, not a script — and both collapse to a single static
 * frame under `prefers-reduced-motion` via the global rule in globals.css,
 * with no extra JS guard needed here.
 */
export function SpectrumSplit() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.82", "end 0.4"] });

  const beamScale = useTransform(scrollYProgress, [0, 0.16], [0, 1]);
  const prismOpacity = useTransform(scrollYProgress, [0.08, 0.2], [0, 1]);
  const glowOpacity = useTransform(scrollYProgress, [0.14, 0.26], [0, 1]);

  const cx = 330;
  const cy = 200;
  const len = 300;
  const apex = { x: cx, y: cy };

  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox="0 0 760 400" className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="prism-front" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.98 0.006 240 / 0.9)" />
            <stop offset="55%" stopColor="oklch(0.7 0.02 250 / 0.55)" />
            <stop offset="100%" stopColor="oklch(0.94 0.01 245 / 0.85)" />
          </linearGradient>
          <linearGradient id="prism-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.99 0.004 240 / 0.8)" />
            <stop offset="100%" stopColor="oklch(0.8 0.012 245 / 0.5)" />
          </linearGradient>
          <linearGradient id="prism-side" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.36 0.02 260 / 0.85)" />
            <stop offset="100%" stopColor="oklch(0.52 0.016 258 / 0.65)" />
          </linearGradient>
          <radialGradient id="prism-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.9 0.03 245 / 0.5)" />
            <stop offset="100%" stopColor="oklch(0.9 0.03 245 / 0)" />
          </radialGradient>
        </defs>

        {/* Incoming beam, with a bright pulse continuously travelling its
            length once revealed — the "this is alive" cue the flat line
            lacked before. */}
        <motion.g
          style={reduce ? undefined : { opacity: beamScale }}
        >
          <line
            x1="18"
            y1={cy}
            x2={apex.x - 46}
            y2={cy}
            stroke="oklch(1 0 0 / 0.55)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {!reduce && (
            <line
              x1="18"
              y1={cy}
              x2={apex.x - 46}
              y2={cy}
              stroke="oklch(1 0 0 / 0.95)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="26 340"
              className="animate-[beam-flow_2.6s_linear_infinite]"
            />
          )}
        </motion.g>

        {/* The prism, faked into 3D with three faces: a glassy front
            triangle, a lighter top catching the ambient light, and a
            shaded side panel — the depth cue a single flat polygon can't
            give. */}
        <motion.g style={reduce ? undefined : { opacity: prismOpacity }}>
          <circle
            cx={apex.x - 30}
            cy={cy}
            r="70"
            fill="url(#prism-glow)"
            style={reduce ? undefined : ({ opacity: glowOpacity } as never)}
          />
          {/* side (back-left panel, offset up-left for depth) */}
          <polygon
            points={`${apex.x - 76},${cy - 50} ${apex.x - 92},${cy - 62} ${apex.x - 92},${cy + 46} ${apex.x - 76},${cy + 58}`}
            fill="url(#prism-side)"
          />
          {/* top (offset copy of the front's top edge) */}
          <polygon
            points={`${apex.x - 76},${cy - 50} ${apex.x},${cy} ${apex.x - 16},${cy - 12} ${apex.x - 92},${cy - 62}`}
            fill="url(#prism-top)"
          />
          {/* front — the actual dispersing face */}
          <polygon
            points={`${apex.x},${cy} ${apex.x - 76},${cy - 50} ${apex.x - 76},${cy + 58}`}
            fill="url(#prism-front)"
            stroke="oklch(1 0 0 / 0.5)"
            strokeWidth="1"
          />
        </motion.g>

        {DIMENSION_ORDER.map((d, i) => (
          <SpectrumBand
            key={d}
            dimension={d}
            index={i}
            progress={scrollYProgress}
            reduce={!!reduce}
            cx={apex.x}
            cy={cy}
            len={len}
          />
        ))}
      </svg>
    </div>
  );
}

// Derived from DIMENSION_ORDER, never hardcoded: this was pinned at 7 while
// the palette grew to 10, which widened the fan to +-54deg instead of +-27deg
// and pushed the last three rays (plus their end dots and labels) below the
// viewBox, where they silently vanished.
const BAND_COUNT = DIMENSION_ORDER.length;
const FAN_HALF_ANGLE = 32;
const ANGLE_STEP = (FAN_HALF_ANGLE * 2) / (BAND_COUNT - 1);

function SpectrumBand({
  dimension,
  index,
  progress,
  reduce,
  cx,
  cy,
  len,
}: {
  dimension: (typeof DIMENSION_ORDER)[number];
  index: number;
  progress: MotionValue<number>;
  reduce: boolean;
  cx: number;
  cy: number;
  len: number;
}) {
  const start = 0.22 + index * 0.058;
  const end = start + 0.12;
  const angle = -FAN_HALF_ANGLE + index * ANGLE_STEP;
  const rad = (angle * Math.PI) / 180;
  // Math.sin/cos can differ in their last bit between the server's libm and
  // the browser's, which is a real hydration mismatch (SSR renders one
  // float, the client re-derives a neighbouring one). Rounding collapses
  // both onto the same string before React ever compares them.
  const dirX = Math.round(Math.cos(rad) * 1e6) / 1e6;
  const dirY = Math.round(Math.sin(rad) * 1e6) / 1e6;
  const endX = Math.round(cx + dirX * len);
  const endY = Math.round(cy + dirY * len);
  const labelX = endX + 14;
  const labelY = endY;
  const meta = SPECTRUM[dimension];

  const pathLength = useTransform(progress, [start, end], [0, 1]);
  const labelOpacity = useTransform(progress, [end - 0.02, end + 0.04], [0, 1]);

  return (
    <g>
      <motion.line
        x1={cx}
        y1={cy}
        x2={endX}
        y2={endY}
        stroke={meta.color}
        strokeWidth="2.8"
        strokeLinecap="round"
        style={reduce ? undefined : { pathLength }}
      />
      {/* A short bright pulse chasing down the resolved band, staggered per
          band so the bands don't pulse in lockstep. This is a *second*
          element rather than reusing the line above: Motion implements its
          `pathLength` style by writing stroke-dasharray/dashoffset itself,
          which would fight a CSS keyframe animating the same properties on
          one element. Motion only ever touches `opacity` here — the dash
          animation is plain CSS, untouched by it. */}
      {!reduce && (
        <motion.line
          x1={cx}
          y1={cy}
          x2={endX}
          y2={endY}
          stroke={meta.color}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeDasharray="10 60"
          className="animate-[ray-flow_2.2s_linear_infinite]"
          style={{
            opacity: labelOpacity,
            animationDelay: `${index * 0.16}s`,
            filter: `drop-shadow(0 0 4px ${meta.color})`,
          }}
        />
      )}
      <motion.circle
        cx={endX}
        cy={endY}
        r="3.4"
        fill={meta.color}
        style={reduce ? undefined : { opacity: labelOpacity }}
      />
      <motion.text
        x={labelX}
        y={labelY}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize="16"
        fill={meta.color}
        style={reduce ? undefined : { opacity: labelOpacity }}
      >
        {meta.label}
      </motion.text>
    </g>
  );
}
