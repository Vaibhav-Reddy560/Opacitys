"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Dimension } from "@/lib/critique/types";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

/**
 * Overall score as a segmented spectral ring — one arc per dimension, each
 * filled to its own score, in spectrum order.
 *
 * A single progress ring would throw away the per-dimension breakdown that
 * is the whole point of the critique; this shows the composite number and
 * its ten components in one read.
 */
export function SpectralScore({
  overall,
  dimensionScores,
  size = 260,
}: {
  overall: number;
  dimensionScores: Partial<Record<Dimension, number>>;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const stroke = 7;
  const gap = 1.8; // degrees of gap between segments — was 3.2, read as a hard notch
  const radius = size / 2 - stroke * 2;
  const cx = size / 2;
  const cy = size / 2;

  const segAngle = 360 / DIMENSION_ORDER.length;
  // The ring wraps from the last segment back to the first, leaving one
  // visible seam — rotating the whole ring so that seam lands at the
  // bottom (behind the "Composite" label) instead of the top, which is
  // where a viewer's eye lands first and read as a stray dark line.
  const ROTATE = 180;

  const polar = (angleDeg: number, r: number) => {
    const a = ((angleDeg + ROTATE - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const arcPath = (startDeg: number, endDeg: number, r: number) => {
    const s = polar(startDeg, r);
    const e = polar(endDeg, r);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-0">
        {DIMENSION_ORDER.map((dim, i) => {
          const start = i * segAngle + gap / 2;
          const end = (i + 1) * segAngle - gap / 2;
          const score = dimensionScores[dim];
          const pct = typeof score === "number" ? Math.max(0, Math.min(100, score)) / 100 : 0;
          const filledEnd = start + (end - start) * pct;

          const wasEvaluated = typeof score === "number";

          return (
            <g key={dim}>
              {/* Track — dimmer for a dimension nothing measured (too few
                  text lines, degenerate image, etc.) than for one that was
                  evaluated and simply scored 0, so "not measured" doesn't
                  read as identical to "failed". */}
              <path
                d={arcPath(start, end, radius)}
                fill="none"
                stroke={wasEvaluated ? "oklch(1 0 0 / 0.07)" : "oklch(1 0 0 / 0.03)"}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
              {/* Filled portion */}
              {pct > 0.01 && (
                <motion.path
                  d={arcPath(start, filledEnd, radius)}
                  fill="none"
                  stroke={SPECTRUM[dim].color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    duration: 0.9,
                    delay: 0.12 + i * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ filter: `drop-shadow(0 0 2px ${SPECTRUM[dim].color})` }}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 grid place-content-center text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="text-6xl leading-none tabular-nums"
            style={{
              fontVariationSettings: '"wght" 600',
              // Was `.text-chrome` — a gradient with a dark stop at its
              // exact midpoint, which cut a grey band straight through the
              // middle of this number. A solid, bright fill can't do that.
              color: "oklch(0.97 0.005 245)",
            }}
          >
            {Math.round(overall)}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Composite
          </div>
        </motion.div>
      </div>
    </div>
  );
}
