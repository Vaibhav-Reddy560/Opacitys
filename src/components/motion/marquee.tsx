"use client";

import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Seamless infinite scroller. Pure CSS animation (see `@keyframes marquee` in
 * globals.css) over two duplicated copies of the content — the loop point is
 * invisible because copy #2 starts exactly where copy #1's midpoint sits.
 * Pauses on hover so the content is actually readable, and sits still
 * entirely under reduced motion rather than just slowing down.
 */
export function Marquee({
  children,
  className,
  duration = 30,
  gap = 48,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
  gap?: number;
}) {
  const reduce = useReducedMotion();

  return (
    <div
      className={cn("group/marquee relative overflow-hidden", className)}
      style={{
        maskImage:
          "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
      }}
    >
      <div
        className={cn(
          "flex w-max",
          !reduce &&
            "animate-[marquee_var(--marquee-duration)_linear_infinite] group-hover/marquee:[animation-play-state:paused]",
        )}
        style={{ gap, ["--marquee-duration" as string]: `${duration}s` }}
      >
        <div className="flex shrink-0 items-center" style={{ gap }}>
          {children}
        </div>
        <div className="flex shrink-0 items-center" aria-hidden style={{ gap }}>
          {children}
        </div>
      </div>
    </div>
  );
}
