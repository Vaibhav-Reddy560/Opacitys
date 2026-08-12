"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Where the first card pins, in rem. Matches the sticky heading's `top-28`. */
const STACK_TOP_REM = 7;
/** How much of each earlier card stays visible once the next one covers it. */
const STACK_OFFSET_REM = 1.25;

/**
 * A sticky heading beside a deck of cards that pile up as you scroll.
 *
 * Each card pins a little lower than the one before it, so a later card
 * slides *over* its predecessor and leaves only a thin sliver showing — the
 * stack builds into a physical deck, and the last card ends up on top.
 *
 * This replaced a plain scrolling column. Because the cards are short and
 * spaced apart, that version left a full screen of nothing between each one
 * while the heading sat unchanged beside it — the section read as broken
 * rather than paced. Stacking fixes it structurally: a card is always
 * covering the frame, so the gaps become scroll *duration* instead of empty
 * space.
 *
 * Still native `position: sticky` for the layout — no scroll-jacking. The one
 * scroll listener exists only to report which card is on top (see below).
 */
export function StickyReveal({
  sticky,
  steps,
  className,
  onStepEnter,
}: {
  sticky: ReactNode;
  steps: ReactNode[];
  className?: string;
  /** Fires with the index of whichever card is currently on top of the deck. */
  onStepEnter?: (index: number) => void;
}) {
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastReported = useRef(-1);

  /**
   * "Topmost card in the deck" is a scroll-position question, so it is
   * measured from position rather than inferred from visibility: a card is on
   * top once its own top edge has reached the offset it pins at, and the
   * highest such index wins.
   *
   * This replaced an `onViewportEnter` approach that was visibly wrong. Entry
   * callbacks fire once per card as it becomes visible, and several cards are
   * on screen together here, so whichever happened to fire last won — the
   * index would jump straight to 03/04 and 01/02 never lit at all. Entering
   * the viewport and being on top of the stack are simply different events.
   */
  useEffect(() => {
    if (!onStepEnter) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      let next = 0;
      for (let i = 0; i < stepRefs.current.length; i++) {
        const el = stepRefs.current[i];
        if (!el) continue;
        const pinTop = parseFloat(getComputedStyle(el).top);
        if (Number.isNaN(pinTop)) continue;
        // 1px tolerance — sticky settles on subpixel offsets.
        if (el.getBoundingClientRect().top <= pinTop + 1) next = i;
      }
      if (next !== lastReported.current) {
        lastReported.current = next;
        onStepEnter(next);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [onStepEnter]);

  return (
    <div className={cn("grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-16", className)}>
      <div className="lg:sticky lg:top-28 lg:self-start">{sticky}</div>
      {/* Two spacing values, both load-bearing.

          space-y: the largest gap ever visible below a pinned card (it can
          never exceed one gap), and also the scroll distance that card dwells
          for before the next covers it. Too small and the deck flicks past;
          too large and the dead space this layout exists to remove is back.

          The trailing spacer: room for the finished deck to HOLD its
          formation before the section scrolls away. Without it the container
          ended the instant the last card pinned, so every earlier card was
          immediately dragged off its offset and they collapsed into one flat
          pile with a large gap above the final card. It has to be a real
          element rather than padding on the container — a sticky element is
          constrained by its containing block's *content* box, so trailing
          padding does not extend the range it can stick through. */}
      <div className="space-y-12">
        {steps.map((step, i) => (
          <StickyStep
            key={i}
            index={i}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
          >
            {step}
          </StickyStep>
        ))}
        <div aria-hidden className="h-[10vh]" />
      </div>
    </div>
  );
}

function StickyStep({
  index,
  ref,
  children,
}: {
  index: number;
  ref?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      ref={ref}
      className="sticky"
      style={{ top: `${STACK_TOP_REM + index * STACK_OFFSET_REM}rem` }}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
