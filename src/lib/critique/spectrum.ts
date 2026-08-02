import type { Dimension, Severity } from "./types";

/**
 * The spectral mapping — the core of the visual identity.
 *
 * A prism splits white light into seven bands; Opacitys splits a design into
 * seven measurable dimensions. They are ordered here in true spectrum order
 * (violet -> red) so a full critique reads as a spectrum, and any single
 * dimension is identifiable by hue alone across every surface in the app.
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
  typography: {
    label: "Typography",
    color: "oklch(0.75 0.15 205)",
    band: 2,
    blurb: "Type scale discipline and measure",
  },
  layout: {
    label: "Layout",
    color: "oklch(0.78 0.17 165)",
    band: 3,
    blurb: "Alignment and underlying grid",
  },
  spacing: {
    label: "Spacing",
    color: "oklch(0.85 0.16 95)",
    band: 4,
    blurb: "Rhythm and proximity grouping",
  },
  balance: {
    label: "Balance",
    color: "oklch(0.75 0.17 55)",
    band: 5,
    blurb: "Distribution of visual weight",
  },
  originality: {
    label: "Originality",
    color: "oklch(0.66 0.22 15)",
    band: 6,
    blurb: "Distance from what already exists",
  },
};

export const DIMENSION_ORDER: Dimension[] = [
  "hierarchy",
  "color",
  "typography",
  "layout",
  "spacing",
  "balance",
  "originality",
];

export const SEVERITY: Record<Severity, { label: string; color: string; weight: number }> = {
  critical: { label: "Critical", color: "oklch(0.66 0.22 15)", weight: 1 },
  major: { label: "Major", color: "oklch(0.78 0.16 70)", weight: 0.6 },
  minor: { label: "Minor", color: "oklch(0.7 0.03 260)", weight: 0.25 },
};

/** Full spectrum as a CSS gradient — used for rims, rules, and the wordmark. */
export const SPECTRUM_GRADIENT = DIMENSION_ORDER.map((d) => SPECTRUM[d].color).join(", ");
