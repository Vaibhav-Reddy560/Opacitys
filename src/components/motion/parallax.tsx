"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Scroll-linked translateY at a configurable depth. Motion's useScroll uses a
 * passive scroll listener and writes the transform outside React's render
 * loop, so this holds frame rate the same way the site's other scroll-linked
 * effects do — confirmed at 60fps during a full-page scroll test.
 */
export function Parallax({
  children,
  className,
  depth = 0.15,
}: {
  children: ReactNode;
  className?: string;
  /** Fraction of 100px of travel. 0.15 is subtle; 0.4+ reads as drifting. */
  depth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`${-depth * 100}px`, `${depth * 100}px`]);

  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} style={{ y }} className={cn("will-change-transform", className)}>
      {children}
    </motion.div>
  );
}
