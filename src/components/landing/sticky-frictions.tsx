"use client";

import { PrismPanel } from "@/components/brand/prism";
import { StickyReveal } from "@/components/motion/sticky-reveal";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { PROBLEM } from "@/lib/copy";
import { SPECTRUM, DIMENSION_ORDER } from "@/lib/critique/spectrum";

/**
 * The heading stays put (native `position: sticky`, no JS) while the four
 * frictions scroll past beside it — the pinned-feature pattern the plan
 * calls for, at the cost of one CSS property.
 */
export function StickyFrictions() {
  return (
    <StickyReveal
      sticky={
        <div className="max-w-md">
          <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">
            {PROBLEM.eyebrow}
          </p>
          <ScrollReveal
            as="h2"
            className="text-balance mt-5 block text-3xl leading-[1.14] tracking-tight sm:text-[2.6rem]"
          >
            <span style={{ fontVariationSettings: '"wght" 500' }}>{PROBLEM.title}</span>
          </ScrollReveal>
          <p className="text-balance mt-4 text-[15px] leading-relaxed text-foreground/62">
            {PROBLEM.body}
          </p>
        </div>
      }
      steps={PROBLEM.frictions.map((f, i) => {
        const accent = SPECTRUM[DIMENSION_ORDER[i]].color;
        return (
          <PrismPanel key={f.title} accent={accent} className="p-7">
            <span
              className="font-mono text-[11px]"
              style={{ color: accent }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3
              className="mt-3 text-[19px] tracking-tight"
              style={{ fontVariationSettings: '"wght" 550' }}
            >
              {f.title}
            </h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-foreground/62">{f.body}</p>
          </PrismPanel>
        );
      })}
    />
  );
}
