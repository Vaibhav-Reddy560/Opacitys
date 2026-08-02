"use client";

import { motion, useReducedMotion } from "motion/react";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

/**
 * A hairline rule that resolves from white light into the seven bands —
 * the identity's core idea rendered as a single 1px element.
 */
export function SpectrumRule() {
  const reduce = useReducedMotion();

  return (
    <div className="relative h-px w-full">
      {/* White light */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.99 0.004 240), transparent)",
        }}
        initial={reduce ? false : { opacity: 1 }}
        whileInView={{ opacity: 0.14 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Split into the spectrum */}
      <div className="absolute inset-0 flex">
        {DIMENSION_ORDER.map((dim, i) => (
          <motion.span
            key={dim}
            className="h-px flex-1"
            style={{ background: SPECTRUM[dim].color }}
            initial={reduce ? false : { opacity: 0, scaleX: 0.2 }}
            whileInView={{ opacity: 0.9, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.9,
              delay: 0.7 + i * 0.07,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>
    </div>
  );
}
