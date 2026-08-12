"use client";

import { useState } from "react";
import { PrismPanel } from "@/components/brand/prism";
import { StickyReveal } from "@/components/motion/sticky-reveal";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { PROBLEM } from "@/lib/copy";
import { SPECTRUM, DIMENSION_ORDER } from "@/lib/critique/spectrum";

/**
 * The heading stays put while the four frictions stack into a deck beside it
 * — see StickyReveal for why they stack rather than simply scroll past.
 *
 * The index below the heading exists for a specific reason: the heading block
 * is much shorter than the section, so pinning it alone left the entire
 * bottom-left of the section empty for the whole scroll. The index fills that
 * space with something that actually earns it — it names all four frictions
 * up front and marks which one you are on, so the pinned column changes as
 * you scroll instead of sitting inert.
 */
export function StickyFrictions() {
  const [active, setActive] = useState(0);

  return (
    <StickyReveal
      onStepEnter={setActive}
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

          <ol className="mt-9 hidden md:block">
            {PROBLEM.frictions.map((f, i) => {
              const accent = SPECTRUM[DIMENSION_ORDER[i]].color;
              const on = i === active;
              return (
                <li key={f.title} className="flex items-center gap-3 py-2">
                  <span
                    aria-hidden
                    className="h-px shrink-0 transition-all duration-500"
                    style={{
                      width: on ? 28 : 14,
                      background: on ? accent : "oklch(1 0 0 / 0.22)",
                      boxShadow: on ? `0 0 8px ${accent}` : undefined,
                    }}
                  />
                  <span
                    className="font-mono text-[10.5px] tabular-nums transition-colors duration-500"
                    style={{ color: on ? accent : "oklch(1 0 0 / 0.3)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="text-[13px] transition-colors duration-500"
                    style={{
                      color: on ? "oklch(0.97 0.004 265)" : "oklch(1 0 0 / 0.38)",
                    }}
                  >
                    {f.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      }
      steps={PROBLEM.frictions.map((f, i) => {
        const accent = SPECTRUM[DIMENSION_ORDER[i]].color;
        return (
          <PrismPanel key={f.title} accent={accent} className="p-7">
            <span className="font-mono text-[11px]" style={{ color: accent }}>
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
