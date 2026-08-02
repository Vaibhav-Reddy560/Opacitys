"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Element eases toward the cursor within a radius, springs back on leave.
 *
 * Uses Motion's spring-backed motion values, not React state: the spring
 * writes straight to the element's transform on its own rAF loop, so a
 * pointer sweep here costs zero re-renders — same discipline as
 * usePointerSpot, just via the animation library instead of raw CSS vars,
 * because a physical spring-back is what "magnetic" needs and CSS can't do
 * that on its own.
 */
export function Magnetic({
  children,
  className,
  strength = 0.35,
  radius = 90,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 240, damping: 20, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 240, damping: 20, mass: 0.4 });

  if (reduce) return <div className={className}>{children}</div>;

  const handleMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    if (Math.hypot(dx, dy) < radius) {
      x.set(dx * strength);
      y.set(dy * strength);
    } else {
      x.set(0);
      y.set(0);
    }
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x: springX, y: springY }}
      className={cn("inline-block will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}
