"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

const COLORS = DIMENSION_ORDER.map((d) => SPECTRUM[d].color);

/**
 * A brief spectral burst from the click point — tactile confirmation that a
 * click landed. Implemented with the Web Animations API on plain DOM nodes
 * created and discarded on click, not React state: this is a rare, bursty
 * event (a handful of animated dots for under half a second), so it costs
 * nothing at rest and doesn't touch the render loop when it fires.
 */
export function ClickSpark({
  children,
  className,
  count = 6,
}: {
  children: ReactNode;
  className?: string;
  count?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const spark = useCallback(
    (e: React.MouseEvent) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const host = ref.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 20 + Math.random() * 16;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;

        const dot = document.createElement("span");
        dot.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:4px;height:4px;border-radius:9999px;pointer-events:none;background:${
          COLORS[i % COLORS.length]
        };transform:translate(-50%,-50%);z-index:40;`;
        host.appendChild(dot);

        const anim = dot.animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 0.95 },
            { transform: `translate(${dx - 2}px, ${dy - 2}px) scale(0)`, opacity: 0 },
          ],
          { duration: 460, easing: "cubic-bezier(0.22,1,0.36,1)" },
        );
        anim.onfinish = () => dot.remove();
      }
    },
    [count],
  );

  return (
    <div ref={ref} onClick={spark} className={cn("relative isolate", className)}>
      {children}
    </div>
  );
}
