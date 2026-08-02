"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "motion/react";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

/**
 * A hairline progress rail down the right edge — orientation, not decoration.
 * The user asked specifically for a legible flow ("understand what is
 * happening and where to"); this is the constant-cost answer: one scroll
 * listener for the whole page, one transform write per frame, via Motion's
 * useScroll (page-level, not per-element).
 */
export function ScrollProgress() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.2 });

  if (reduce) return null;

  return (
    <div
      aria-hidden
      className="fixed right-0 top-0 z-50 hidden h-svh w-[3px] sm:block"
    >
      <div className="absolute inset-0 bg-white/[0.05]" />
      <motion.div
        className="absolute inset-x-0 top-0 origin-top"
        style={{
          height: "100%",
          scaleY: progress,
          background: `linear-gradient(to bottom, ${SPECTRUM_GRADIENT})`,
        }}
      />
    </div>
  );
}
