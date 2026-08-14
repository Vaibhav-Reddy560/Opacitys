import "server-only";
import path from "node:path";

/**
 * The typefaces Rebuild can render replacement copy in.
 *
 * This is a MATCHING set, not a licensing convenience: a design's real
 * typeface is almost never one an app can legally ship, so the honest goal is
 * "close enough that a replaced word doesn't announce itself", and then to
 * name the face that was used rather than implying an exact match.
 *
 * Two of these are metric-compatible clones, which matters more than it
 * sounds. Arimo has the same advance widths as Arial, and Tinos the same as
 * Times New Roman — so for the very large number of posters, decks and flyers
 * set in Arial, Helvetica or Times, replacement text occupies the same
 * horizontal space per character as the original did. That removes the most
 * visible tell of a substituted word: the line no longer filling the space it
 * used to fill.
 *
 * ── Why every weight is its own file ──
 *
 * These arrive from Google Fonts as variable fonts, and are baked down to
 * static instances by scripts/build-fonts.py. That is not tidiness: the only
 * opentype.js API that applies a variation axis is its shaping pipeline,
 * which throws outright on some of these fonts for some strings, and the
 * per-glyph API that doesn't throw silently ignores the axis and renders
 * everything at the default weight. Static instances make the safe API the
 * correct one. See the script's docstring for the full reasoning.
 *
 * Everything here is SIL Open Font License. Files sit alongside this module
 * and are force-included in the serverless bundle by next.config.ts — nothing
 * imports them, so the tracer cannot see them on its own.
 */

export type FontClass = "grotesque" | "geometric" | "humanist" | "condensed" | "display" | "serif";

export interface FontFamily {
  id: string;
  /** Human-facing name, shown to the user so a substitution is never implied to be exact. */
  label: string;
  classes: FontClass[];
  /** CSS weight -> filename. Always contains at least 400. */
  weights: Record<number, string>;
  /** The face whose metrics this reproduces exactly, when it reproduces one. */
  metricTwin?: string;
  notes: string;
  /** True for faces that only make sense in all-caps. */
  uppercaseOnly?: boolean;
}

/** A concrete, renderable choice: one family at one weight. */
export interface FontChoice {
  family: FontFamily;
  weight: number;
  file: string;
}

const DIR = path.join(process.cwd(), "src", "lib", "rebuild", "fonts", "files");

export const FONTS: FontFamily[] = [
  {
    id: "arimo",
    label: "Arimo",
    classes: ["grotesque"],
    weights: { 400: "Arimo-400.ttf", 700: "Arimo-700.ttf" },
    metricTwin: "Arial / Helvetica",
    notes: "Neutral grotesque. First choice for anything that looks like Arial or Helvetica.",
  },
  {
    id: "inter",
    label: "Inter",
    classes: ["grotesque", "humanist"],
    weights: { 400: "Inter-400.ttf", 700: "Inter-700.ttf", 900: "Inter-900.ttf" },
    notes: "Modern UI grotesque with a large x-height. Good for screenshots and product UI.",
  },
  {
    id: "archivo",
    label: "Archivo",
    classes: ["grotesque", "condensed"],
    weights: { 400: "Archivo-400.ttf", 700: "Archivo-700.ttf", 900: "Archivo-900.ttf" },
    notes: "Squarer grotesque that holds up at display sizes; common in event and corporate design.",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    classes: ["geometric"],
    weights: { 400: "Montserrat-400.ttf", 700: "Montserrat-700.ttf", 900: "Montserrat-900.ttf" },
    notes: "Geometric sans with circular bowls. Very common in modern event and startup design.",
  },
  {
    id: "roboto-condensed",
    label: "Roboto Condensed",
    classes: ["condensed", "grotesque"],
    weights: { 400: "RobotoCondensed-400.ttf", 700: "RobotoCondensed-700.ttf" },
    notes: "Condensed workhorse for dense headlines.",
  },
  {
    id: "oswald",
    label: "Oswald",
    classes: ["condensed", "display"],
    weights: { 400: "Oswald-400.ttf", 700: "Oswald-700.ttf" },
    notes: "Tall narrow display face, strongly vertical.",
  },
  {
    id: "bebas-neue",
    label: "Bebas Neue",
    classes: ["condensed", "display"],
    weights: { 400: "BebasNeue-400.ttf" },
    uppercaseOnly: true,
    notes: "All-caps condensed display.",
  },
  {
    id: "playfair",
    label: "Playfair Display",
    classes: ["serif", "display"],
    weights: {
      400: "PlayfairDisplay-400.ttf",
      700: "PlayfairDisplay-700.ttf",
      900: "PlayfairDisplay-900.ttf",
    },
    notes: "High-contrast display serif for editorial headlines.",
  },
  {
    id: "tinos",
    label: "Tinos",
    classes: ["serif"],
    weights: { 400: "Tinos-400.ttf", 700: "Tinos-700.ttf" },
    metricTwin: "Times New Roman",
    notes: "Body serif. First choice for anything that looks like Times.",
  },
];

export function findFamily(id: string): FontFamily | null {
  return FONTS.find((f) => f.id === id) ?? null;
}

/** Absolute path to a choice's .ttf. */
export function fontPath(choice: FontChoice): string {
  return path.join(DIR, choice.file);
}

/**
 * The family's closest available weight to the one requested.
 *
 * A design's text is measured to a continuous weight (see readTextStyle's
 * stroke ratio) but only a handful of real instances exist, so this snaps —
 * and the snapped value is what gets reported back, so nothing downstream
 * believes it rendered a weight it didn't.
 */
export function chooseWeight(family: FontFamily, want: number): FontChoice {
  const available = Object.keys(family.weights).map(Number).sort((a, b) => a - b);
  let best = available[0];
  for (const w of available) {
    if (Math.abs(w - want) < Math.abs(best - want)) best = w;
  }
  return { family, weight: best, file: family.weights[best] };
}

/** Every renderable family/weight pair, for exhaustive matching. */
export function allChoices(opts: { isUppercase: boolean }): FontChoice[] {
  const out: FontChoice[] = [];
  for (const family of FONTS) {
    if (family.uppercaseOnly && !opts.isUppercase) continue;
    for (const w of Object.keys(family.weights).map(Number)) {
      out.push({ family, weight: w, file: family.weights[w] });
    }
  }
  return out;
}
