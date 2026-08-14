import "server-only";
import fs from "node:fs";
// Named imports, not a default import: opentype.js's ESM build
// (dist/opentype.mjs, which is what `module` points at and what Turbopack
// resolves) exports only named bindings and has no default. A default import
// works under CJS interop — so it type-checks and runs fine under tsx — and
// then fails the production build with "Export default doesn't exist in
// target module".
import { parse as parseFont, type Font, type PathCommand } from "opentype.js";
import sharp from "sharp";
import { fontPath, type FontChoice } from "../fonts/catalog";

/**
 * Renders a string as pixels, from real font outlines.
 *
 * ── Why outlines, and not SVG <text> ──
 *
 * sharp can rasterise SVG, and SVG has a <text> element, so the obvious
 * implementation is to emit `<text font-family="Arimo">`. That works locally
 * and fails in production: SVG text resolves fonts through the host's
 * fontconfig, and Vercel's Node base image ships almost none. The text would
 * silently render in a fallback face, or not at all.
 *
 * Converting each glyph to a <path> removes font resolution from the raster
 * step entirely — by the time sharp sees it, there is no text, only filled
 * outlines. The .ttf is read directly by this module, so the only requirement
 * is that the file is in the bundle (see next.config.ts).
 *
 * ── Why a measured height, and not a font size ──
 *
 * Nothing measurable in a raster design corresponds to "font size". Point
 * size is a property of the em box, which is invisible. What IS measurable is
 * how tall the letters are, and that is what has to match for a replaced word
 * to sit correctly on the same line as its neighbours. So the caller
 * specifies a height in pixels and this solves for the font size that
 * produces it — per font, since the ratio to the em differs between faces
 * (Inter's cap height is 1490/2048; Arimo's is not).
 *
 * WHICH height matters, though, which is why `metric` exists: a line reading
 * "STARTING" shows its cap height, while one reading "soon" has no capital
 * and no ascender, so the tallest thing in it is the x-height. See SizeMetric.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RenderedText {
  /** RGBA PNG, cropped tight to the ink. */
  bytes: Buffer;
  width: number;
  height: number;
  /** Distance from the top of the bitmap down to the text baseline. */
  baselineY: number;
}

/**
 * Parsing a 500KB font on every edit is wasteful, and these are immutable
 * files. Keyed by path; the process-wide cache survives across requests on a
 * warm Fluid instance.
 */
const cache = new Map<string, Font>();

function loadFont(choice: FontChoice): Font {
  const file = fontPath(choice);
  const hit = cache.get(file);
  if (hit) return hit;

  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    throw new Error(
      `Font file missing: ${choice.file}. It must be included in the deployment bundle — see outputFileTracingIncludes in next.config.ts.`,
    );
  }
  // opentype.parse needs a real ArrayBuffer view of exactly these bytes;
  // Buffer's underlying pool is shared and usually larger than the file.
  const font = parseFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  cache.set(file, font);
  return font;
}

/**
 * Which vertical measurement a caller's pixel size refers to.
 *
 * Both are needed because only one of them is observable in any given piece
 * of text. A line reading "STARTING" shows its cap height; a line reading
 * "soon" contains no capital and no ascender, so the tallest thing in it is
 * the x-height. Treating that x-height as a cap height renders the
 * replacement about 21% too small — measured, on Arimo: asking for a 200px
 * cap height and reading the result back gave 158px.
 */
export type SizeMetric = "cap" | "xHeight";

/**
 * The font's cap height or x-height, in em units.
 *
 * OS/2 carries both explicitly, but not every font fills the fields in, and a
 * zero there would silently produce absurd font sizes. Measuring a reference
 * glyph is the reliable fallback — "H" is flat-topped at exactly the cap
 * height, "x" flat-topped at exactly the x-height, which is what those terms
 * mean.
 *
 * The glyph is fetched via charToGlyph rather than font.getPath: the latter
 * runs opentype.js's shaping pipeline, which throws outright on several fonts
 * in this catalogue (see layout()). A fallback path that can throw is worse
 * than no fallback.
 */
function metricUnits(font: Font, metric: SizeMetric): number {
  const declared = metric === "cap" ? font.tables.os2?.sCapHeight : font.tables.os2?.sxHeight;
  if (typeof declared === "number" && declared > 0) return declared;

  try {
    const glyph = font.charToGlyph(metric === "cap" ? "H" : "x");
    const measured = Math.abs(glyph.getPath(0, 0, font.unitsPerEm).getBoundingBox().y1);
    if (measured > 0) return measured;
  } catch {
    // fall through to the ratio below
  }

  // Last resort: typical ratios. Better than dividing by zero.
  return font.unitsPerEm * (metric === "cap" ? 0.7 : 0.52);
}

/**
 * Lays out a string one glyph at a time, applying kerning by hand.
 *
 * `font.getPath()` would be the obvious call, but it runs opentype.js's full
 * shaping pipeline, and that throws outright on several perfectly ordinary
 * fonts in this catalogue — Inter and Montserrat both carry GSUB lookup
 * formats it hasn't implemented ("substFormat: 2 is not yet supported"). The
 * feature it's applying there is `ccmp`, which for Latin display text has
 * nothing to do; the shaping is pure overhead that happens to be fatal.
 *
 * Going glyph by glyph skips GSUB entirely and keeps what actually matters
 * for this use — correct advance widths and real kern pairs. It also means
 * measureWidth() and renderText() walk the identical loop, so a fitted width
 * is guaranteed to be the width that renders, rather than two estimates that
 * agree most of the time.
 */
function layout(
  font: Font,
  text: string,
  fontSize: number,
  letterSpacingEm: number,
): { advance: number; place: Array<{ glyph: ReturnType<Font["charToGlyph"]>; x: number }> } {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = Array.from(text).map((ch) => font.charToGlyph(ch));
  const place: Array<{ glyph: (typeof glyphs)[number]; x: number }> = [];

  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    place.push({ glyph: glyphs[i], x });
    x += (glyphs[i].advanceWidth ?? 0) * scale;
    const next = glyphs[i + 1];
    if (next) x += font.getKerningValue(glyphs[i], next) * scale;
    x += letterSpacingEm * fontSize;
  }
  return { advance: x, place };
}

/**
 * Serialises a glyph outline to SVG path data.
 *
 * opentype.js has `Path.toPathData()` for exactly this, and it cannot be
 * used: it rounds with the `+(Math.round(v + "e+2") + "e-2")` idiom, which
 * silently returns NaN whenever a coordinate's default string form is already
 * in exponential notation. Floating-point residue produces such values
 * routinely — a point that should be 0 arriving as 1.42e-14 — and the result
 * is a `d` attribute containing the literal text "NaN", which librsvg parses
 * as far as the first one and then stops.
 *
 * It is size-dependent, which is what makes it so unpleasant: Inter's
 * cap-height ratio yields a font size where this happens for most letters, so
 * the face rendered as a blank image at one requested cap height and
 * perfectly at the next pixel up. Formatting the numbers here removes the
 * whole class of failure.
 */
function pathToD(commands: PathCommand[]): string {
  const n = (v: number | undefined): string => {
    if (v === undefined || !Number.isFinite(v)) return "0";
    // toFixed never uses exponential notation in this range, and stripping a
    // trailing ".00" keeps the attribute short.
    const s = v.toFixed(2);
    return s.endsWith(".00") ? s.slice(0, -3) : s;
  };

  let d = "";
  for (const c of commands) {
    switch (c.type) {
      case "M":
        d += `M${n(c.x)} ${n(c.y)}`;
        break;
      case "L":
        d += `L${n(c.x)} ${n(c.y)}`;
        break;
      case "Q":
        d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        break;
      case "C":
        d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        break;
      case "Z":
        d += "Z";
        break;
    }
  }
  return d;
}

/**
 * One `<path>` per glyph, each drawn at a LOCAL origin and moved into place
 * with a transform — rather than one long path in absolute coordinates.
 *
 * This is a workaround for librsvg, and an ugly one, but the failure it
 * avoids is worse: baking the layout position into the coordinates produces
 * values in the thousands, and past a certain magnitude librsvg silently
 * stops rendering partway through the path. Measured at a 234px cap height,
 * "CLOSING" came out as "CLO" plus half an S, with the remaining glyphs
 * simply absent — no error, no warning, a plausible-looking image with three
 * letters missing. Keeping every coordinate glyph-local (never more than a
 * few hundred units) renders the whole string every time.
 */
function toSvg(
  place: Array<{ glyph: ReturnType<Font["charToGlyph"]>; x: number }>,
  fontSize: number,
  originX: number,
  baselineY: number,
  fill: string,
  width: number,
  height: number,
): string {
  const body = place
    .map(({ glyph, x }) => {
      const d = pathToD(glyph.getPath(0, 0, fontSize).commands);
      if (!d) return "";
      return `<g transform="translate(${(originX + x).toFixed(2)} ${baselineY.toFixed(2)})"><path d="${d}" fill="${fill}"/></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

export async function renderText(params: {
  text: string;
  /** Family AND weight — the weight is baked into the file, never applied here. */
  font: FontChoice;
  /** Target height in pixels of whichever feature `metric` names. */
  sizePx: number;
  /** What sizePx measures. Defaults to cap height. */
  metric?: SizeMetric;
  color: RGB;
  /** Extra tracking as a fraction of the em, matching CSS letter-spacing in em. */
  letterSpacingEm?: number;
}): Promise<RenderedText> {
  const { text, font: choice, sizePx, metric = "cap", color, letterSpacingEm = 0 } = params;
  if (!text.trim()) throw new Error("Cannot render empty text.");

  const font = loadFont(choice);

  // Solve for the font size that yields the requested measurement.
  const fontSize = (sizePx * font.unitsPerEm) / metricUnits(font, metric);

  const { place } = layout(font, text, fontSize, letterSpacingEm);

  // Bounds of the laid-out string, computed from each glyph's own local box
  // plus its pen position. Never build one combined absolute path for this —
  // see toSvg for why the coordinates have to stay small.
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const { glyph, x } of place) {
    const b = glyph.getPath(0, 0, fontSize).getBoundingBox();
    // A space has no outline; its box is degenerate and would poison the bounds.
    if (!Number.isFinite(b.x1) || b.x2 <= b.x1) continue;
    x1 = Math.min(x1, b.x1 + x);
    x2 = Math.max(x2, b.x2 + x);
    y1 = Math.min(y1, b.y1);
    y2 = Math.max(y2, b.y2);
  }
  if (!Number.isFinite(x1) || x2 <= x1) {
    throw new Error(`Rendered text produced no ink (${JSON.stringify(text)}).`);
  }

  const pad = Math.ceil(fontSize * 0.08);
  const width = Math.ceil(x2 - x1) + pad * 2;
  const height = Math.ceil(y2 - y1) + pad * 2;
  // Where the pen origin and the baseline land inside the cropped canvas.
  const originX = -Math.floor(x1) + pad;
  const baselineY = -Math.floor(y1) + pad;

  const fill = `rgb(${color.r},${color.g},${color.b})`;
  const svg = toSvg(place, fontSize, originX, baselineY, fill, width, height);
  const bytes = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();

  return { bytes, width, height, baselineY };
}

/**
 * The width this string would occupy at a given cap height, without
 * rasterising it.
 *
 * Used to fit a replacement into the space the original text had: a
 * substitution that overruns its box is worse than one set slightly tighter,
 * so the caller solves for the tracking (or picks a condensed face) that
 * makes it fit.
 */
export function measureWidth(params: {
  text: string;
  font: FontChoice;
  sizePx: number;
  metric?: SizeMetric;
  letterSpacingEm?: number;
}): number {
  const font = loadFont(params.font);
  const fontSize = (params.sizePx * font.unitsPerEm) / metricUnits(font, params.metric ?? "cap");
  return layout(font, params.text, fontSize, params.letterSpacingEm ?? 0).advance;
}

/**
 * Solves for the tracking that makes `text` occupy exactly `targetWidth`.
 *
 * A replacement string almost never has the same natural width as the one it
 * replaces — "CLOSING" is seven characters where "STARTING" was eight — and a
 * centred line that changes width is fine while a line aligned to something
 * else is not. Letter-spacing is the least damaging way to close that gap:
 * unlike scaling the cap height it keeps the text on its baseline and at the
 * same visual weight as its neighbours.
 *
 * Returns null when the required tracking is beyond what stays legible
 * (roughly a tenth of an em either way), so the caller can decide to accept a
 * different width rather than render something visibly stretched.
 */
export function fitTracking(params: {
  text: string;
  font: FontChoice;
  sizePx: number;
  metric?: SizeMetric;
  targetWidth: number;
}): number | null {
  const { text, font, sizePx, metric = "cap", targetWidth } = params;
  const natural = measureWidth({ text, font, sizePx, metric, letterSpacingEm: 0 });

  const fontFile = loadFont(font);
  const fontSize = (sizePx * fontFile.unitsPerEm) / metricUnits(fontFile, metric);
  // layout() adds letterSpacingEm * fontSize after EVERY glyph including the
  // last, so the width delta is (n) * spacing * fontSize, not (n-1).
  const perEm = (targetWidth - natural) / (Array.from(text).length * fontSize);

  if (!Number.isFinite(perEm) || Math.abs(perEm) > 0.1) return null;
  return perEm;
}
