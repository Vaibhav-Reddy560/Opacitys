"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ChromeFilterDefs, chromeFilterIds } from "./chrome-filter";

/**
 * The OPACITYS wordmark — the only place Nemesis is ever used.
 *
 * Rebuilt on an SVG filter (see chrome-filter.tsx) instead of layered CSS
 * gradients. Gradients can only shade *across the whole word*; real chrome
 * type shades *across each stroke* — a bright spine, a dark edge, coloured
 * fringing at the transition. That needs the glyph's alpha channel, which
 * only a filter has access to.
 *
 * SIZING. Callers pass a Tailwind text-size className exactly as before
 * (including fluid `clamp()` values, which the hero uses). That className
 * lands on the host div; a layout effect reads its *computed* font-size in
 * px and renders the SVG at that size 1:1 (1 user unit = 1 css px), so the
 * filter's blur/surfaceScale/dispersion — which are tuned in px — stay
 * meaningful at every call site. A ResizeObserver re-measures on layout
 * changes (the clamp() hero size changes with viewport width), and
 * document.fonts.ready triggers one re-measure in case Nemesis swapped in
 * after the fallback font's metrics were used for the first pass.
 */

interface Box {
  w: number;
  h: number;
  fontSize: number;
  originX: number;
  originY: number;
  /**
   * The bleed padding baked into w/h/origin. Re-applied as a negative margin
   * so the *layout* box hugs the glyphs while the *filter* keeps its room —
   * see the note on the <svg> below.
   */
  pad: number;
}

/**
 * Height -> hue mapping. A blurred glyph's interior only spans a narrow band
 * of heights, so the gain expands that band to fill the whole spectral table
 * and the bias picks which part of the spectrum a stroke's centre sits on.
 * Shared between the static render and the pointer loop so the two agree on
 * their starting point and there is no jump on first move.
 */
const HUE_GAIN = 3.1;
const HUE_BIAS = 1.32;

export function Wordmark({
  className,
  text = "OPACITYS",
  interactive = true,
  shade = 0.5,
}: {
  className?: string;
  text?: string;
  interactive?: boolean;
  /**
   * Chrome filter edge-darkening depth (0-1, see ChromeFilterDefs). Lower
   * reads as brighter/more filled-in — the only real lever here, since the
   * wordmark is otherwise always at CSS opacity: 1. Defaults to the value
   * every call site used before this was a prop.
   */
  shade?: number;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const idPrefix = `wm${rawId}`;
  const ids = chromeFilterIds(idPrefix);

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<SVGTextElement>(null);

  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const textEl = textRef.current;
    if (!host || !textEl) return;

    const measure = () => {
      const cs = getComputedStyle(host);
      const fontSize = parseFloat(cs.fontSize) || 16;
      textEl.setAttribute("font-size", String(fontSize));
      // Letter-spacing has to be written onto the text node, not left to CSS
      // inheritance: getBBox() below has to measure the *spaced* advance or
      // the SVG box comes out too narrow and the last glyph gets clipped.
      // Computed style resolves em/rem to px for us.
      const tracking = cs.letterSpacing;
      textEl.setAttribute(
        "letter-spacing",
        tracking && tracking !== "normal" ? tracking : "0",
      );
      const bbox = textEl.getBBox(); // unaffected by the filter — pure geometry
      const pad = Math.max(10, fontSize * 0.24); // room for specular/dispersion bleed
      setBox({
        w: bbox.width + pad * 2,
        h: bbox.height + pad * 2,
        fontSize,
        originX: bbox.x - pad,
        originY: bbox.y - pad,
        pad,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [text]);

  // Two values move: where the light sits, and where in the spectrum a
  // stroke's centre lands. The first slides the specular spine along the
  // letters; the second slides the entire rainbow through them. Both are
  // written straight to DOM attributes from one rAF loop — never React
  // state — and the filter re-rasterises once per frame either way, so the
  // second one is effectively free.
  useEffect(() => {
    if (!box) return;
    const light = document.getElementById(ids.light);
    const hue = document.getElementById(ids.hue);
    if (!light) return;

    const defaultTarget = {
      x: box.originX + box.w * 0.24,
      y: box.originY - box.h * 0.3,
      bias: HUE_BIAS,
    };
    const z = box.fontSize * 1.05;
    light.setAttribute("z", String(z));
    light.setAttribute("x", String(defaultTarget.x));
    light.setAttribute("y", String(defaultTarget.y));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover)").matches;
    if (!interactive || reduce || !canHover) return;

    const svg = svgRef.current;
    if (!svg) return;

    let raf = 0;
    let visible = true;
    const target = { ...defaultTarget };
    const current = { ...defaultTarget };

    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), {
      rootMargin: "80px",
    });
    io.observe(svg);

    const onMove = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      target.x = box.originX + fx * box.w;
      target.y = box.originY + fy * box.h - box.h * 0.45;
      // Clamped hard: past about ±0.2 the whole word collapses onto one hue
      // and the iridescence reads as a flat colour wash instead of a sweep.
      target.bias = HUE_BIAS + (Math.max(-0.6, Math.min(1.6, fx)) - 0.5) * 0.34;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      current.x += (target.x - current.x) * 0.09;
      current.y += (target.y - current.y) * 0.09;
      current.bias += (target.bias - current.bias) * 0.06;
      light.setAttribute("x", String(current.x));
      light.setAttribute("y", String(current.y));
      if (hue) {
        const b = -current.bias;
        hue.setAttribute(
          "values",
          `0 0 0 ${HUE_GAIN} ${b} 0 0 0 ${HUE_GAIN} ${b} 0 0 0 ${HUE_GAIN} ${b} 0 0 0 0 1`,
        );
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, [box, interactive, ids.light, ids.hue]);

  return (
    <div
      ref={hostRef}
      className={cn("inline-block select-none leading-none", className)}
      style={{ fontFamily: "var(--font-wordmark)" }}
    >
      {box && (
        <ChromeFilterDefs
          idPrefix={idPrefix}
          // ~half a stroke width, so each stem rounds over completely rather
          // than keeping a flat plateau down its middle with all the shading
          // and all the colour crushed into the outer few pixels.
          blur={Math.max(0.9, box.fontSize * 0.055)}
          surfaceScale={box.fontSize * 0.055}
          // Small type gets a broader, softer highlight: a tight hotspot on
          // 20px text lands on two or three pixels and reads as a speckle.
          specularExponent={box.fontSize < 30 ? 14 : 22}
          dispersion={Math.max(0.5, box.fontSize * 0.012)}
          spectrum={box.fontSize < 30 ? 0.5 : 0.44}
          shade={shade}
          hueGain={HUE_GAIN}
          hueBias={HUE_BIAS}
        />
      )}

      {box ? (
        <svg
          ref={svgRef}
          width={box.w}
          height={box.h}
          viewBox={`${box.originX} ${box.originY} ${box.w} ${box.h}`}
          style={{
            display: "block",
            // The filter's specular and dispersion need `pad` px of bleed on
            // every side, and overflow:visible lets them have it. But that
            // padding was also sitting inside the *layout* box — at the hero's
            // 176px that is ~42px of dead space under the title and to the
            // left of the O in the nav, which every call site then had to
            // guess at with magic margins. Cancelling it here makes the box
            // hug the glyphs, so `mt-5` next to a Wordmark means 5, and the
            // filter still paints outside the box exactly as before.
            margin: `${-box.pad}px`,
            overflow: "visible",
          }}
          role="img"
          aria-label={text}
        >
          <text
            ref={textRef}
            x="0"
            y="0"
            fontFamily="var(--font-wordmark)"
            fontSize={box.fontSize}
            fill={`url(#${ids.gradient})`}
            filter={`url(#${ids.filter})`}
          >
            {text}
          </text>
        </svg>
      ) : (
        // Invisible pre-measure pass: same text/font, no filter, so the very
        // first paint has a node to call getBBox() on instead of a flash of
        // unstyled text.
        <svg width="0" height="0" style={{ position: "absolute", opacity: 0 }} aria-hidden>
          <text ref={textRef} fontFamily="var(--font-wordmark)" fontSize="100">
            {text}
          </text>
        </svg>
      )}
    </div>
  );
}
