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
    let x = 50;
    let y = 50;
    let pending = false;

    const flush = () => {
      raf = 0;
      pending = false;
      el.style.setProperty("--spot-x", `${x}%`);
      el.style.setProperty("--spot-y", `${y}%`);
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      x = ((e.clientX - rect.left) / rect.width) * 100;
      y = ((e.clientY - rect.top) / rect.height) * 100;
      if (!pending) {
        pending = true;
        raf = requestAnimationFrame(flush);
      }
    };

    const onEnter = () => el.style.setProperty("--spot-on", "1");
    const onLeave = () => {
      el.style.setProperty("--spot-on", "0");
      x = 50;
      y = 50;
      if (!pending) {
        pending = true;
        raf = requestAnimationFrame(flush);
      }
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
