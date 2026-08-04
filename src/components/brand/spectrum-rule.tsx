"use client";

import { motion, useReducedMotion } from "motion/react";
import { SPECTRUM_RULE_GRADIENT } from "@/lib/critique/spectrum";

/**
 * A hairline rule that resolves from white light into the spectrum — the
 * identity's core idea rendered as a single 1px element.
 *
 * Deliberately the *same* fill as `PrismRule` (via SPECTRUM_RULE_GRADIENT):
 * one smooth blend fading out at both ends. An earlier version drew ten
 * equal-width hard-edged segments instead, which read as flag stripes rather
 * than dispersed light and looked like a different component from the studio
 * dividers. The only thing unique to this one is the reveal below.
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
      {/* Split into the spectrum. scaleX carries the "light spreading out"
          beat the per-segment stagger used to do, without reintroducing any
          visible boundary between colors. 0.55 matches PrismRule exactly. */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ background: SPECTRUM_RULE_GRADIENT }}
        initial={reduce ? false : { opacity: 0, scaleX: 0.2 }}
        whileInView={{ opacity: 0.55, scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
