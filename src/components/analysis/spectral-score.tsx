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
 * its seven components in one read.
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
  const gap = 3.2; // degrees of gap between segments
  const radius = size / 2 - stroke * 2;
  const cx = size / 2;
  const cy = size / 2;

  const segAngle = 360 / DIMENSION_ORDER.length;

  const polar = (angleDeg: number, r: number) => {
    const a = ((angleDeg - 90) * Math.PI) / 180;
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

          return (
            <g key={dim}>
              {/* Track */}
              <path
                d={arcPath(start, end, radius)}
                fill="none"
                stroke="oklch(1 0 0 / 0.07)"
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
                  style={{ filter: `drop-shadow(0 0 6px ${SPECTRUM[dim].color})` }}
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
            className="text-chrome text-6xl leading-none tabular-nums"
            style={{ fontVariationSettings: '"wght" 600' }}
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
