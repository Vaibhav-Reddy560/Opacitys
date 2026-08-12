"use client";

import { useEffect, useRef } from "react";

/**
 * Tracks the pointer within an element and exposes it as CSS custom properties
 * (`--spot-x`, `--spot-y` in %, `--spot-on` 0/1) written straight to the node.
 *
 * The first version of the chrome components held pointer position in React
 * state, which meant a re-render on *every mousemove event* — for each button
 * and card on screen. That is the second half of why the page felt laggy.
 * Writing CSS vars on the DOM node skips React entirely: the browser only
 * recomputes the gradient that reads the variable.
 *
 * Reads are also coalesced into a single rAF so a burst of mousemove events in
 * one frame produces one style write.
 */
export function usePointerSpot<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Touch/pen devices have no hover; skip the listeners entirely.
    if (!window.matchMedia("(hover: hover)").matches) return;

    let raf = 0;
    let clientX = 0;
    let clientY = 0;
    let pending = false;
    // The element's box, sampled on enter and on resize rather than on every
    // move. `getBoundingClientRect()` forces the browser to flush pending
    // style and layout work synchronously, so calling it from a pointermove
    // handler means a forced reflow per event — at pointer event rates, on
    // an element that also carries blur/backdrop-filter/gradient paint, that
    // is exactly the stutter this hook was written to avoid. The rect only
    // changes on scroll/resize/layout, not on mouse motion.
    let rect: DOMRect | null = null;
    const sampleRect = () => {
      rect = el.getBoundingClientRect();
    };

    const flush = () => {
      raf = 0;
      pending = false;
      if (!rect) return;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--spot-x", `${x}%`);
      el.style.setProperty("--spot-y", `${y}%`);
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(flush);
    };

    const onMove = (e: PointerEvent) => {
      clientX = e.clientX;
      clientY = e.clientY;
      schedule();
    };

    const onEnter = (e: PointerEvent) => {
      // Re-sampled per enter, so a rect invalidated by scrolling or a layout
      // shift since the last hover is refreshed before it's used.
      sampleRect();
      clientX = e.clientX;
      clientY = e.clientY;
      el.style.setProperty("--spot-on", "1");
      schedule();
    };
    const onLeave = () => {
      el.style.setProperty("--spot-on", "0");
      // Recentre without another rect read — the spotlight is faded out by
      // --spot-on anyway, this just leaves it in a neutral spot for next time.
      el.style.setProperty("--spot-x", "50%");
      el.style.setProperty("--spot-y", "50%");
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return ref;
}
