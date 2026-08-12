"use client";

import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/reveal";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { cn } from "@/lib/utils";

/**
 * The eyebrow / h2 / lede trio repeated across the landing page's sections —
 * extracted from three near-identical copies (the "how", "spectrum" and
 * "studio" sections in page.tsx). `sticky-frictions.tsx` has its own
 * fourth copy but is deliberately NOT a consumer here: it lives inside a
 * pinned sticky column with no `Reveal` wrapper at all, a genuinely
 * different animation context, not one more instance of this pattern.
 *
 * Normalizes a small inconsistency the three originals had: two of the
 * three wrapped eyebrow+h2+lede in one `Reveal`, one split the lede into
 * its own separately-delayed `Reveal`. This always uses the single-Reveal
 * form — one fewer thing for the page to vary, per the point of extracting
 * this at all.
 */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  titleClassName,
  ledeClassName,
  className,
}: {
  eyebrow: string;
  /** A plain string renders through the same `fontVariationSettings: "wght"
   *  500` span every site used; pass a node directly for anything richer. */
  title: ReactNode;
  lede?: ReactNode;
  /** Override the h2's max-width — sites disagree (none / max-w-2xl). */
  titleClassName?: string;
  /** Override the lede's max-width — sites disagree (max-w-md / xl / 2xl). */
  ledeClassName?: string;
  className?: string;
}) {
  return (
    <Reveal className={className}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">{eyebrow}</p>
      <ScrollReveal
        as="h2"
        className={cn(
          "text-balance mt-5 block text-3xl leading-[1.14] tracking-tight sm:text-[2.6rem]",
          titleClassName,
        )}
      >
        {typeof title === "string" ? (
          <span style={{ fontVariationSettings: '"wght" 500' }}>{title}</span>
        ) : (
          title
        )}
      </ScrollReveal>
      {lede && (
        <p className={cn("text-balance mt-4 text-[15px] leading-relaxed text-foreground/62", ledeClassName)}>
          {lede}
        </p>
      )}
    </Reveal>
  );
}
