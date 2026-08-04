import type { Dimension, Severity } from "./types";

/**
 * The spectral mapping — the core of the visual identity.
 *
 * A prism splits white light into bands; Opacitys splits a design into ten
 * measurable dimensions. Ordered here by descending hue (violet -> red) so a
 * full critique reads as one clean ramp, and any single dimension is
 * identifiable across every surface in the app.
 *
 * The palette is deliberately saturated and full-spectrum — that IS the
 * brand. Two constraints keep it reading as an instrument rather than a
 * pride flag:
 *
 *   1. NO MAGENTA/PINK. `rhythm` briefly sat at hue 330, which pushed the
 *      set past violet into flag territory. It now sits at 235 (azure),
 *      which also fills what was the palette's widest gap (205->265).
 *   2. ORDERED BY DESCENDING HUE, always. `DIMENSION_ORDER` drives every
 *      gradient in the app, so any non-monotonic entry shows up as a visible
 *      hue jump. An earlier version ran 295..15 then wrapped back to
 *      330/130/40, which is exactly what made the rules and rails look wrong.
 */
export const SPECTRUM: Record<
  Dimension,
  { label: string; color: string; band: number; blurb: string }
> = {
  hierarchy: {
    label: "Hierarchy",
    color: "oklch(0.62 0.22 295)",
    band: 0,
    blurb: "Where the eye lands, and in what order",
  },
  color: {
    label: "Color",
    color: "oklch(0.62 0.2 265)",
    band: 1,
    blurb: "Contrast ratios and palette relationships",
  },
  rhythm: {
    label: "Rhythm",
    color: "oklch(0.69 0.18 235)",
    band: 2,
    blurb: "Pace and visual momentum",
  },
  typography: {
    label: "Typography",
    color: "oklch(0.75 0.15 205)",
    band: 3,
    blurb: "Type scale discipline and measure",
  },
  layout: {
    label: "Layout",
    color: "oklch(0.78 0.17 165)",
    band: 4,
    blurb: "Alignment and underlying grid",
  },
  contrast: {
    label: "Contrast",
    color: "oklch(0.75 0.18 130)",
    band: 5,
    blurb: "Visual separation and emphasis",
  },
  spacing: {
    label: "Spacing",
    color: "oklch(0.85 0.16 95)",
    band: 6,
    blurb: "Rhythm and proximity grouping",
  },
  balance: {
    label: "Balance",
    color: "oklch(0.75 0.17 55)",
    band: 7,
    blurb: "Distribution of visual weight",
  },
  depth: {
    label: "Depth",
    color: "oklch(0.72 0.19 40)",
    band: 8,
    blurb: "Layering and visual hierarchy",
  },
  originality: {
    label: "Originality",
    color: "oklch(0.66 0.22 15)",
    band: 9,
    blurb: "Distance from what already exists",
  },
};

/**
 * Strictly descending hue: 295, 265, 235, 205, 165, 130, 95, 55, 40, 15.
 * This drives every gradient in the app, so keep it monotonic — a
 * non-monotonic entry renders as a visible hue jump on the rules, the scroll
 * rail and the wordmark sweep.
 */
export const DIMENSION_ORDER: Dimension[] = [
  "hierarchy",
  "color",
  "rhythm",
  "typography",
  "layout",
  "contrast",
  "spacing",
  "balance",
  "depth",
  "originality",
];

export const SEVERITY: Record<Severity, { label: string; color: string; weight: number }> = {
  critical: { label: "Critical", color: "oklch(0.66 0.22 15)", weight: 1 },
  major: { label: "Major", color: "oklch(0.78 0.16 70)", weight: 0.6 },
  minor: { label: "Minor", color: "oklch(0.7 0.03 260)", weight: 0.25 },
};

/** Full spectrum as a CSS gradient — used for rims, rules, and the wordmark. */
export const SPECTRUM_GRADIENT = DIMENSION_ORDER.map((d) => SPECTRUM[d].color).join(", ");

/**
 * The hairline-rule fill: the spectrum blending smoothly across its length and
 * fading to nothing at both ends. Shared by `PrismRule` (studio) and
 * `SpectrumRule` (landing hero) — they are meant to be the same rule, and
 * defining it once is what stops them drifting apart again.
 */
export const SPECTRUM_RULE_GRADIENT = `linear-gradient(90deg, transparent, ${SPECTRUM_GRADIENT}, transparent)`;
