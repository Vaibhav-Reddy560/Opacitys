"use client";

/**
 * The prismatic chrome SVG filter.
 *
 * WHAT MAKES METAL READ AS METAL. Not an outline. Chrome is sold by two
 * things: a *value* structure that mimics a reflected environment (bright
 * sky, a hard dark horizon, a lit ground) and shading that runs *across the
 * width of each stroke* so every letter reads as a rounded tube. A gradient
 * alone can do the first but never the second, because a gradient knows
 * nothing about glyph geometry. A filter does, via the alpha channel.
 *
 * WHAT MAKES IT PRISMATIC. Real iridescence (thin-film interference, the
 * oil-on-water effect) shifts hue as a function of the surface normal — the
 * angle you see the surface at. So here the hue is driven by the same height
 * field that drives the lighting: the rainbow wraps around each stroke's
 * curvature instead of being painted across the word in flat bands. That is
 * the difference between "a rainbow gradient in the shape of letters" and
 * metal that is actually iridescent.
 *
 * THE CHAIN
 *   height   feGaussianBlur(SourceAlpha)   the tube cross-section. The blur
 *            radius is roughly half a stroke width, so the whole stroke
 *            rounds over rather than only its edges. It never softens the
 *            glyph itself — only the shading derived from it.
 *
 *   A. Form  height -> per-channel ramp -> multiply into the fill. Darkens
 *            stroke edges toward a cool blue rather than black, and does it
 *            as a smooth ramp across the whole stroke, so it reads as
 *            roundness and never as an outline. (The previous version drew
 *            a literal dark ring with feMorphology. That is a stroke, which
 *            is exactly what it looked like.)
 *
 *   B. Iris  height -> gain/bias -> spectral lookup table -> overlay onto
 *            the metal. Overlay (not screen) is the right blend: it deepens
 *            colour where the metal is dark and keeps highlights pastel,
 *            which is how iridescent metal actually behaves. The gain/bias
 *            matrix is the animated one — sliding the bias slides the entire
 *            spectrum through the letterforms.
 *
 *   C. Spec  feSpecularLighting on the same height field gives the bright
 *            band down each stroke's spine, then the R and B channels are
 *            pulled apart a sub-pixel amount to fringe the highlight. That
 *            is dispersion — white light separating — and it is what keeps
 *            the hot spine from reading as flat white.
 *
 * Two attribute writes drive the whole thing: the fePointLight position and
 * the bias in the iridescence matrix. Both are written straight to the DOM
 * from one rAF loop, never through React state, and the filter re-rasterises
 * once per frame regardless of how many of its parameters changed.
 */

interface ChromeFilterDefsProps {
  /**
   * Unique per mounted instance (pass React's useId()). Every id inside this
   * component is derived from it. Without it, two Wordmarks on the same page
   * (hero + footer, sidebar + page header) would share one filter and one
   * light — moving the pointer over one would move the specular in all.
   */
  idPrefix: string;
  /**
   * Height-field blur in px. Wants to be near *half a stroke width* so the
   * stroke rounds over fully; too small leaves a flat plateau down the middle
   * of every stem with the shading crushed into the edges. Scales with size.
   */
  blur?: number;
  /** How tubular the strokes read under the specular. Higher = rounder. */
  surfaceScale?: number;
  /** Highlight tightness. Higher = smaller, harder specular hotspot. */
  specularExponent?: number;
  /** Sub-pixel R/B separation for the dispersion fringes. */
  dispersion?: number;
  /** Iridescence strength, 0–1. How much of the spectral pass survives. */
  spectrum?: number;
  /** Tube-shading depth, 0–1. Edge darkening, cool-tinted, never black. */
  shade?: number;
  /**
   * Contrast of the height -> hue mapping. Higher spreads more of the
   * spectrum across each stroke; the useful window is narrow because a
   * blurred glyph's interior height only spans roughly 0.45–1.
   */
  hueGain?: number;
  /** Where in the spectrum a stroke's centre sits. The animated value. */
  hueBias?: number;
}

export function chromeFilterIds(idPrefix: string) {
  return {
    filter: `${idPrefix}-filter`,
    light: `${idPrefix}-light`,
    hue: `${idPrefix}-hue`,
    gradient: `${idPrefix}-gradient`,
  };
}

/**
 * The iridescent sweep, sampled across the stroke's cross-section:
 * violet -> blue -> cyan -> spring -> green -> yellow -> orange -> pink ->
 * magenta. Ends on magenta/violet so the wrap point where the spectrum
 * leaves one stroke and enters the next is continuous rather than a seam.
 */
const IRIS_R = "0.62 0.24 0.10 0.20 0.55 1.00 1.00 1.00 0.92";
const IRIS_G = "0.18 0.44 0.86 1.00 1.00 0.92 0.60 0.46 0.28";
const IRIS_B = "1.00 1.00 0.96 0.72 0.38 0.24 0.22 0.82 1.00";

export function ChromeFilterDefs({
  idPrefix,
  blur = 6,
  surfaceScale = 6,
  specularExponent = 24,
  dispersion = 1.6,
  spectrum = 0.44,
  shade = 0.5,
  hueGain = 3.1,
  hueBias = 1.32,
}: ChromeFilterDefsProps) {
  const ids = chromeFilterIds(idPrefix);

  // Tube shading, per channel. Blue keeps the most floor and red the least,
  // so an unlit edge falls toward deep blue-violet — the colour a chrome
  // surface actually reflects from a dark room — instead of toward black.
  const floorR = 1 - shade * 0.86;
  const floorG = 1 - shade * 0.78;
  const floorB = 1 - shade * 0.58;

  const hueMatrix = [
    `0 0 0 ${hueGain} ${-hueBias}`,
    `0 0 0 ${hueGain} ${-hueBias}`,
    `0 0 0 ${hueGain} ${-hueBias}`,
    `0 0 0 0 1`,
  ].join(" ");

  return (
    <svg
      aria-hidden
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/*
          The reflected environment. Read it top to bottom as what a mirrored
          surface would be seeing: violet zenith, a blown-out sky, cyan
          falling to a dark blue horizon band, then a HARD flip to warm white
          at 49% — that single abrupt edge is the horizon line, and it is the
          most important stop in the whole ramp. Smooth it out and the metal
          instantly turns into a plastic gradient. Below it, warm ground with
          a pink bounce near the base.
        */}
        <linearGradient id={ids.gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.60 0.035 288)" />
          <stop offset="9%" stopColor="oklch(0.95 0.018 258)" />
          <stop offset="21%" stopColor="oklch(1 0.008 230)" />
          <stop offset="33%" stopColor="oklch(0.84 0.022 218)" />
          <stop offset="42%" stopColor="oklch(0.47 0.030 250)" />
          <stop offset="48.5%" stopColor="oklch(0.30 0.038 268)" />
          {/* the horizon — 1.5% of the ramp doing most of the work */}
          <stop offset="50%" stopColor="oklch(1 0.012 95)" />
          <stop offset="59%" stopColor="oklch(0.93 0.030 88)" />
          <stop offset="70%" stopColor="oklch(0.56 0.034 48)" />
          <stop offset="81%" stopColor="oklch(0.88 0.026 352)" />
          <stop offset="91%" stopColor="oklch(1 0.012 318)" />
          <stop offset="100%" stopColor="oklch(0.64 0.036 300)" />
        </linearGradient>

        <filter
          id={ids.filter}
          x="-10%"
          y="-28%"
          width="120%"
          height="156%"
          colorInterpolationFilters="sRGB"
        >
          {/* The height field every stage below is derived from. */}
          <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="height" />

          {/* ---- A. form ------------------------------------------------ */}
          {/* Move alpha into RGB so it can be used as a colour, then ramp
              each channel from its floor at the stroke edge up to 1 at the
              spine, and multiply it into the fill. Alpha stays 1 across the
              region so the multiply cannot eat into the glyph's own alpha. */}
          <feColorMatrix
            in="height"
            type="matrix"
            values="0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1"
            result="hMap"
          />
          <feComponentTransfer in="hMap" result="shadeMask">
            <feFuncR type="linear" slope={1 - floorR} intercept={floorR} />
            <feFuncG type="linear" slope={1 - floorG} intercept={floorG} />
            <feFuncB type="linear" slope={1 - floorB} intercept={floorB} />
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
          {/* arithmetic k1=1 is a straight multiply. Both operands are
              premultiplied and the mask's alpha is 1, so the glyph's own
              alpha survives untouched and only its colour is scaled. */}
          <feComposite
            in="SourceGraphic"
            in2="shadeMask"
            operator="arithmetic"
            k1="1"
            k2="0"
            k3="0"
            k4="0"
            result="formed"
          />

          {/* ---- B. iridescence ----------------------------------------- */}
          {/* Same height field, expanded through gain/bias so the narrow band
              of heights that actually occurs inside a glyph fills the whole
              lookup table, then mapped to the spectrum. Sliding the bias
              slides the rainbow along every stroke at once — this is the
              matrix the pointer animates. */}
          <feColorMatrix in="height" type="matrix" values={hueMatrix} id={ids.hue} result="hSpec" />
          <feComponentTransfer in="hSpec" result="iris">
            <feFuncR type="table" tableValues={IRIS_R} />
            <feFuncG type="table" tableValues={IRIS_G} />
            <feFuncB type="table" tableValues={IRIS_B} />
          </feComponentTransfer>
          <feComposite in="iris" in2="SourceAlpha" operator="in" result="irisIn" />
          {/* Overlay, not screen: multiplies into the dark half of the metal
              and screens into the light half, which is what keeps the result
              reading as coloured *metal* rather than as a rainbow sticker. */}
          <feBlend in="irisIn" in2="formed" mode="overlay" result="tinted" />
          <feComposite
            in="tinted"
            in2="formed"
            operator="arithmetic"
            k1="0"
            k2={spectrum}
            k3={1 - spectrum}
            k4="0"
            result="metal"
          />

          {/* ---- C. specular + dispersion -------------------------------- */}
          <feSpecularLighting
            in="height"
            surfaceScale={surfaceScale}
            specularConstant="1.4"
            specularExponent={specularExponent}
            lightingColor="#ffffff"
            result="spec"
          >
            <fePointLight id={ids.light} x="120" y="-60" z="110" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />

          {/* Split the highlight into R/G/B, diverge red and blue, recombine.
              Green stays put, as in real dispersion. */}
          <feColorMatrix
            in="specIn"
            type="matrix"
            values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
            result="rOnly"
          />
          <feOffset in="rOnly" dx={-dispersion} dy={-dispersion * 0.4} result="rShift" />
          <feColorMatrix
            in="specIn"
            type="matrix"
            values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
            result="gOnly"
          />
          <feColorMatrix
            in="specIn"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
            result="bOnly"
          />
          <feOffset in="bOnly" dx={dispersion} dy={dispersion * 0.4} result="bShift" />
          <feBlend in="rShift" in2="gOnly" mode="screen" result="rg" />
          <feBlend in="rg" in2="bShift" mode="screen" result="dispersed" />

          {/* Screen caps at white instead of blowing out where the highlight
              lands on an already-bright part of the reflected sky. */}
          <feBlend in="dispersed" in2="metal" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
}
