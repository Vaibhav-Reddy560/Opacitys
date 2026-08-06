import type { Dimension, Severity } from "./types";

/**
 * The spectral mapping — the core of the visual identity.
 *
 * A prism splits white light into bands; Opacitys splits a design into nine
 * measurable dimensions, each grounded in a real design-book principle (see
 * the analyzer files under src/lib/measure/analyzers for the citation and
 * algorithm behind each one). Ordered here by descending hue (violet -> red)
 * so a full critique reads as one clean ramp, and any single dimension is
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
    blurb: "Legibility of text against what sits behind it",
  },
  rhythm: {
    label: "Rhythm",
    color: "oklch(0.69 0.18 235)",
    band: 2,
    blurb: "Whether lines land on a shared vertical grid",
  },
  typography: {
    label: "Typography",
    color: "oklch(0.75 0.15 205)",
    band: 3,
    blurb: "How many distinct type sizes are in play",
  },
  layout: {
    label: "Layout",
    color: "oklch(0.78 0.17 165)",
    band: 4,
    blurb: "Alignment and the underlying grid",
  },
  contrast: {
    label: "Contrast",
    color: "oklch(0.75 0.18 130)",
    band: 5,
    blurb: "Whether the step from body to headline is decisive",
  },
  spacing: {
    label: "Spacing",
    color: "oklch(0.85 0.16 95)",
    band: 6,
    blurb: "Whether the gaps between elements are consistent",
  },
  balance: {
    label: "Balance",
    color: "oklch(0.75 0.17 55)",
    band: 7,
    blurb: "Distribution of visual weight",
  },
  restraint: {
    label: "Restraint",
    // Same color "originality" (the retired dimension) held — the
    // Originality studio feature reads this color too, and inheriting it
    // exactly means removing this dimension changes nothing about how that
    // feature looks.
    color: "oklch(0.66 0.22 15)",
    band: 8,
    blurb: "How much the design carries that it doesn't need",
  },
};

/**
 * Strictly descending hue: 295, 265, 235, 205, 165, 130, 95, 55, 15. This
 * drives every gradient in the app, so keep it monotonic — a non-monotonic
 * entry renders as a visible hue jump on the rules, the scroll rail and the
 * wordmark sweep.
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
  "restraint",
];

export const SEVERITY: Record<Severity, { label: string; color: string; weight: number }> = {
  critical: { label: "Critical", color: "oklch(0.66 0.22 15)", weight: 1 },
  major: { label: "Major", color: "oklch(0.78 0.16 70)", weight: 0.6 },
  minor: { label: "Minor", color: "oklch(0.7 0.03 260)", weight: 0.25 },
};

/**
 * Accent for the library ("Your work") — not a MODULES entry, so it has no
 * `dimension` of its own. Deliberately NOT one of the nine SPECTRUM colors:
 * all nine are already claimed by a module, so reusing any would collide
 * with that module's own sidebar icon. Pulled toward yellow/gold on request,
 * but shifted off spacing's hue 95 (Route) — same brightness family, clearly
 * a different band.
 */
export const META_ACCENT = "oklch(0.85 0.15 75)";

/**
 * Correspondence's own accent. `translate`'s `dimension` in copy.ts is
 * still literally `"balance"` — a leftover from when "depth" was retired
 * from the critique dimension set and correspondence's accent fell back to
 * balance rather than a dimension no analyzer measures any more (see the
 * comment on that MODULES entry). That fallback was written as
 * collision-free only because Instruments (tools, the *other* module on
 * `balance`) was still `status: "planned"` and never rendered a live icon —
 * once Instruments shipped, the two sidebar icons became identical. Rather
 * than reassign `dimension` (there is no tenth free slot among the nine
 * SPECTRUM keys — reassigning to any of them just relocates the same
 * collision onto whichever module already owns it), Correspondence gets its
 * own accent here and every site that computes a module's color goes
 * through `moduleAccent()` below instead of reading `dimension` directly.
 * Muted and warm deliberately, not another saturated spectral band — it
 * reads as "off to the side of the prism," matching how little
 * correspondence has to do with critique scoring in the first place.
 */
export const CORRESPONDENCE_ACCENT = "oklch(0.8 0.05 40)";

/**
 * The one place that decides a module's sidebar/header accent. Every
 * generic `SPECTRUM[m.dimension]` lookup across the app should call this
 * instead of reading `dimension` directly — it's what keeps the
 * Correspondence special-case (see CORRESPONDENCE_ACCENT above) from having
 * to be duplicated at every call site, and centralizes the one exception so
 * a future module reassignment only has to be taught here.
 */
export function moduleAccent(m: { slug: string; dimension: string }): string {
  if (m.slug === "translate") return CORRESPONDENCE_ACCENT;
  return SPECTRUM[m.dimension as Dimension]?.color ?? SPECTRUM.balance.color;
}

/** Full spectrum as a CSS gradient — used for rims, rules, and the wordmark. */
export const SPECTRUM_GRADIENT = DIMENSION_ORDER.map((d) => SPECTRUM[d].color).join(", ");

/**
 * The hairline-rule fill: the spectrum blending smoothly across its length and
 * fading to nothing at both ends. Shared by `PrismRule` (studio) and
 * `SpectrumRule` (landing hero) — they are meant to be the same rule, and
 * defining it once is what stops them drifting apart again.
 */
export const SPECTRUM_RULE_GRADIENT = `linear-gradient(90deg, transparent, ${SPECTRUM_GRADIENT}, transparent)`;
