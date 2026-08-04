"use client";

import { Marquee } from "@/components/motion/marquee";
import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

// Repeated 3x within a single Marquee "copy" — one lap of the ten
// dimensions alone is narrower than most viewports, so the un-duplicated
// version visibly ran out of content and left the right side of the belt
// looking empty before the loop caught up. Marquee already duplicates its
// children once for the seamless loop; this is a second, independent
// density fix on top of that.
const REPEATED = [...DIMENSION_ORDER, ...DIMENSION_ORDER, ...DIMENSION_ORDER];

export function DimensionMarquee() {
  return (
    <Marquee duration={78} gap={40} className="py-1">
      {REPEATED.map((d, i) => (
        <span key={`${d}-${i}`} className="flex items-center gap-2.5 whitespace-nowrap">
          <span
            className="size-1.5 rounded-full"
            style={{ background: SPECTRUM[d].color, boxShadow: `0 0 8px ${SPECTRUM[d].color}` }}
          />
          <span className="text-[13px] tracking-tight text-foreground/52">
            {SPECTRUM[d].label}
          </span>
        </span>
      ))}
    </Marquee>
  );
}
