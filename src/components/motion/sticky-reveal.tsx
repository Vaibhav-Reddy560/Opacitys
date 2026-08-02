"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The "pinned feature" pattern: a sticky column stays put while a taller
 * column of steps scrolls past it, then releases naturally when the taller
 * column runs out — all native `position: sticky`, no scroll-jacking, no
 * scroll listener at all. This is the cheapest possible way to get the
 * pinned-then-released feel the plan calls for.
 */
export function StickyReveal({
  sticky,
  steps,
  className,
}: {
  sticky: ReactNode;
  steps: ReactNode[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-16", className)}>
      <div className="lg:sticky lg:top-28 lg:self-start">{sticky}</div>
      <div className="space-y-20">
        {steps.map((step, i) => (
          <StickyStep key={i}>{step}</StickyStep>
        ))}
      </div>
    </div>
  );
}

function StickyStep({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
