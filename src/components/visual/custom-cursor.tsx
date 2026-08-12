"use client";

import { useEffect, useId, useRef } from "react";
import { ChromeFilterDefs, chromeFilterIds } from "@/components/brand/chrome-filter";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

/**
 * The site's custom cursor — a small solid arrowhead (Lucide's
 * `MousePointer2` glyph, the same "modern pointer" shape used by Linear,
 * Framer et al. for custom cursors) filled through the same chrome +
 * dispersion filter as the wordmark, with a soft rotating spectral halo
 * behind it. Mounted once in the root layout, so it is live everywhere —
 * landing page and every studio route — not just the hero.
 *
 * The halo is rainbow over plain page, but collapses to a single hue whenever
 * the pointer is inside an element that publishes `data-cursor-accent` — the
 * cards, panels and icons that already light up in their dimension's colour.
 * It also dims there: a solid accent at the rainbow's opacity reads much
 * heavier than the rainbow does, and the point is to agree with the card's
 * glow rather than compete with it.
 *
 * Disabled outright on touch/coarse pointers and under reduced motion, in
 * which case the native cursor is left alone entirely. One rAF loop writes
 * a single `transform`; hover/press state is two class toggles driven by
 * event delegation, not React state, so nothing here re-renders per frame
 * or per pointer move.
 */
const ARROW_PATH =
  "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z";

const INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, [role='button'], [data-cursor='interactive']";

/**
 * Any element that lights up in one of the spectral colours publishes it as
 * `data-cursor-accent` (PrismPanel, PrismIcon — see prism.tsx). `closest()`
 * means the innermost accented ancestor wins, so an accented icon sitting
 * inside a differently-accented panel resolves to the icon.
 */
const ACCENT_SELECTOR = "[data-cursor-accent]";

/** Halo opacity over plain page vs. over an accented element. */
const HALO_IDLE_OPACITY = "0.4";
const HALO_ACCENT_OPACITY = "0.22";

const rainbowHalo = `conic-gradient(${SPECTRUM_GRADIENT})`;
/** Falls off to nothing rather than filling the disc — a flat accent at the same size reads far heavier than the rainbow it replaces. */
const accentHalo = (accent: string) =>
  `radial-gradient(circle at 50% 50%, ${accent} 0%, transparent 72%)`;

export function CustomCursor() {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idPrefix = `cur${rawId}`;
  const ids = chromeFilterIds(idPrefix);
  const hostRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduce || !canHover) return;

    const host = hostRef.current;
    if (!host) return;

    document.documentElement.classList.add("custom-cursor-active");

    const light = document.getElementById(ids.light);
    if (light) {
      // Fixed relative to the glyph — the cursor moves as a rigid object,
      // so its own lighting has no reason to hunt around like the
      // wordmark's does.
      light.setAttribute("x", "14");
      light.setAttribute("y", "-4");
      light.setAttribute("z", "24");
    }

    let raf = 0;
    let x = -100;
    let y = -100;
    let visible = false;

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      visible = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onLeaveWindow = () => {
      visible = false;
    };
    document.addEventListener("pointerleave", onLeaveWindow);

    // Sampled on pointerover rather than per frame: the accent can only
    // change when the pointer crosses into a different element, which is
    // exactly when this fires. Per-frame elementFromPoint + getComputedStyle
    // would cost a style resolution every frame for the same answer.
    const halo = haloRef.current;
    let currentAccent: string | null = null;

    const applyAccent = (accent: string | null) => {
      if (!halo || accent === currentAccent) return;
      currentAccent = accent;
      halo.style.background = accent ? accentHalo(accent) : rainbowHalo;
      halo.style.opacity = accent ? HALO_ACCENT_OPACITY : HALO_IDLE_OPACITY;
    };

    const onOver = (e: PointerEvent) => {
      const target = e.target as Element | null;
      host.classList.toggle("is-active", !!target?.closest(INTERACTIVE_SELECTOR));
      const accented = target?.closest(ACCENT_SELECTOR);
      applyAccent(accented?.getAttribute("data-cursor-accent") || null);
    };
    document.addEventListener("pointerover", onOver, { passive: true });

    const onDown = () => host.classList.add("is-down");
    const onUp = () => host.classList.remove("is-down");
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    // Only touch the DOM when something actually changed. The loop still
    // runs every frame (it's the cheapest way to coalesce a burst of
    // pointermove events into one write), but an unconditional style write
    // per frame dirties this layer forever — and this particular layer is
    // expensive to repaint: an SVG specular/dispersion filter plus a
    // blurred, spinning conic gradient. Skipping the write when the pointer
    // is still lets the compositor leave it alone entirely.
    let lastX = NaN;
    let lastY = NaN;
    let lastVisible: boolean | null = null;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (visible !== lastVisible) {
        lastVisible = visible;
        host.style.opacity = visible ? "1" : "0";
      }
      if (x !== lastX || y !== lastY) {
        lastX = x;
        lastY = y;
        host.style.transform = `translate(${x}px, ${y}px)`;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("custom-cursor-active");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeaveWindow);
      document.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [ids.light]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="opacitys-cursor pointer-events-none fixed left-0 top-0 z-[100] opacity-0 [transition:opacity_180ms_ease]"
      style={{ willChange: "transform, opacity" }}
    >
      <div className="cursor-arrow relative -translate-x-[3px] -translate-y-[2px]">
        <span
          ref={haloRef}
          aria-hidden
          className="pointer-events-none absolute -inset-6 -z-10 rounded-full blur-[15px] [transition:background_220ms_ease,opacity_220ms_ease]"
          style={{
            background: rainbowHalo,
            opacity: HALO_IDLE_OPACITY,
            animation: "spin 4.5s linear infinite",
          }}
        />
        <ChromeFilterDefs
          idPrefix={idPrefix}
          blur={0.7}
          surfaceScale={2.6}
          specularExponent={16}
          dispersion={0.5}
          spectrum={0.5}
          shade={0.55}
        />
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          style={{
            display: "block",
            filter: `url(#${ids.filter}) drop-shadow(0 2px 5px oklch(0 0 0 / 0.55))`,
          }}
        >
          <path d={ARROW_PATH} fill={`url(#${ids.gradient})`} />
        </svg>
      </div>
    </div>
  );
}
