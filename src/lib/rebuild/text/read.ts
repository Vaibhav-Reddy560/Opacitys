import "server-only";
import sharp from "sharp";
import type { RGB } from "./render";

/**
 * Measures how a piece of text in an image is set — colour, cap height,
 * stroke weight, line positions — from the pixels alone.
 *
 * No model is involved, and that is the point. Asking a vision model "what
 * size is this text" gets you a plausible number rather than a correct one,
 * and every one of these quantities is directly observable. A model is only
 * needed to read what the text SAYS, and even that is usually unnecessary
 * here because the user's own instruction supplies both the old and the new
 * string.
 *
 * The measurements are what let a replacement sit on the same baseline, at
 * the same cap height, in the same colour, at a matched weight — which is
 * the difference between a substitution nobody notices and one that shouts.
 */

export interface TextLine {
  /** Ink bounding box within the region: x, y, w, h. */
  box: [number, number, number, number];
  /**
   * Height of the line's ink, from the top of its tallest letters down to the
   * baseline.
   *
   * NOT necessarily a cap height — that depends on which letters are present.
   * "STARTING" gives a cap height; "soon" has no capital and no ascender, so
   * this is its x-height. The caller knows the string and so knows which;
   * see SizeMetric in ./render.
   */
  inkHeightPx: number;
  /** Baseline position, relative to the region's top edge. */
  baselineY: number;
  /** Mean stem width divided by cap height — the shape-independent weight signal. */
  strokeRatio: number;
  /** strokeRatio mapped onto a CSS weight, clamped to 100-900. */
  weight: number;
  /** True when no glyph rises above the modal cap line (i.e. it reads as all-caps). */
  isUppercase: boolean;
  /**
   * How many separate letterforms this line contains, counted from the gaps
   * between them.
   *
   * Width alone cannot identify which line holds a given string, because the
   * typeface is unknown: a condensed face can set twenty characters in the
   * space a wide face uses for eight, so almost any string "fits" almost any
   * line. A glyph count is independent of the face — eight letters are eight
   * letters however they are drawn — which makes it the discriminating signal
   * when matching a known string to an unknown line.
   *
   * Undercounts when letters touch (script faces, very tight tracking) and
   * overcounts a letter split by a gap at its own baseline, so it is used as a
   * loose bound, never an equality test.
   */
  glyphCount: number;
}

export interface TextStyle {
  color: RGB;
  background: RGB;
  lines: TextLine[];
}

/** Pixels closer to the ink cluster than this fraction of the cluster gap count as ink. */
const INK_CUTOFF = 0.5;
/** A row/column with fewer than this fraction of the max ink count is treated as empty. */
const NOISE_FLOOR = 0.06;

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Splits the region's pixels into "background" and "ink" by luminance.
 *
 * A design's text region is overwhelmingly bimodal — a field colour and a
 * mark colour — so a 1-D two-means pass on luminance separates them reliably
 * and, unlike a fixed threshold, works for light-on-dark as readily as
 * dark-on-light. Photographic backgrounds (the reference poster sets navy
 * text over a photo of a glass building) spread one cluster out but do not
 * merge the two, because the text is chosen to contrast with its ground.
 */
function twoMeans(lumas: Float64Array): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of lumas) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || lo === hi) return { lo, hi: lo };

  let cLo = lo;
  let cHi = hi;
  for (let iter = 0; iter < 12; iter++) {
    let sumLo = 0;
    let nLo = 0;
    let sumHi = 0;
    let nHi = 0;
    const mid = (cLo + cHi) / 2;
    for (const v of lumas) {
      if (v < mid) {
        sumLo += v;
        nLo++;
      } else {
        sumHi += v;
        nHi++;
      }
    }
    const nextLo = nLo ? sumLo / nLo : cLo;
    const nextHi = nHi ? sumHi / nHi : cHi;
    if (Math.abs(nextLo - cLo) < 0.5 && Math.abs(nextHi - cHi) < 0.5) {
      cLo = nextLo;
      cHi = nextHi;
      break;
    }
    cLo = nextLo;
    cHi = nextHi;
  }
  return { lo: cLo, hi: cHi };
}

/** The modal value of a small integer sample, used for stem width and cap line. */
function mode(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  let best = values[0];
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/**
 * Maps stem-width-over-cap-height onto a CSS weight.
 *
 * The anchors are measured from real faces rather than invented: across
 * common grotesques a Regular sits near 0.11 and a Bold near 0.18, and the
 * relationship is close enough to linear between them to interpolate. Clamped
 * hard, because an outlier here would render a wildly wrong weight rather
 * than a slightly wrong one.
 */
function strokeRatioToWeight(ratio: number): number {
  // Anchors measured with this very estimator against the shipped catalogue,
  // not taken from type-design theory: Arimo 400 reads 0.137 and Arimo 700
  // reads 0.209; Archivo 400/700 read 0.141/0.218. Calibrating against the
  // estimator's own output is what makes the number comparable to the one it
  // produces for a user's image.
  const REG = { ratio: 0.14, weight: 400 };
  const BOLD = { ratio: 0.21, weight: 700 };
  const slope = (BOLD.weight - REG.weight) / (BOLD.ratio - REG.ratio);
  const raw = REG.weight + (ratio - REG.ratio) * slope;
  return Math.max(100, Math.min(900, Math.round(raw / 50) * 50));
}

export async function readTextStyle(regionBytes: Buffer): Promise<TextStyle> {
  const { data, info } = await sharp(regionBytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const lumas = new Float64Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    lumas[p] = luma(data[i], data[i + 1], data[i + 2]);
  }

  const { lo, hi } = twoMeans(lumas);
  const gap = hi - lo;
  if (gap < 4) {
    throw new Error("That selection has no readable text — it looks like a flat area.");
  }

  // Whichever cluster occupies less area is the ink; glyphs never outweigh
  // their own background in a text block.
  let nLo = 0;
  const mid = (lo + hi) / 2;
  for (const v of lumas) if (v < mid) nLo++;
  const inkIsDark = nLo < W * H - nLo;
  const inkCentre = inkIsDark ? lo : hi;
  const bgCentre = inkIsDark ? hi : lo;
  const threshold = inkCentre + (bgCentre - inkCentre) * INK_CUTOFF;

  const isInk = (p: number): boolean => (inkIsDark ? lumas[p] < threshold : lumas[p] > threshold);

  // Average the actual RGB of each cluster's core pixels — the cluster
  // centres above are luminance only, and text colour is a hue as well.
  const acc = { ink: { r: 0, g: 0, b: 0, n: 0 }, bg: { r: 0, g: 0, b: 0, n: 0 } };
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    // Only pixels well clear of the boundary, so anti-aliased edges don't
    // drag both colours toward each other.
    const d = Math.abs(lumas[p] - inkCentre);
    const target = d < gap * 0.25 ? acc.ink : Math.abs(lumas[p] - bgCentre) < gap * 0.25 ? acc.bg : null;
    if (!target) continue;
    target.r += data[i];
    target.g += data[i + 1];
    target.b += data[i + 2];
    target.n++;
  }
  const avg = (a: { r: number; g: number; b: number; n: number }): RGB =>
    a.n
      ? { r: Math.round(a.r / a.n), g: Math.round(a.g / a.n), b: Math.round(a.b / a.n) }
      : { r: 0, g: 0, b: 0 };

  // ── Split into lines by horizontal projection ──
  const rowInk = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (isInk(y * W + x)) n++;
    rowInk[y] = n;
  }
  const maxRow = Math.max(...rowInk);
  if (maxRow === 0) throw new Error("No text found in that selection.");
  const rowFloor = Math.max(1, maxRow * NOISE_FLOOR);

  const bands: Array<[number, number]> = [];
  let start = -1;
  for (let y = 0; y < H; y++) {
    const on = rowInk[y] >= rowFloor;
    if (on && start < 0) start = y;
    else if (!on && start >= 0) {
      bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0) bands.push([start, H - 1]);

  const lines: TextLine[] = [];
  for (const [y0, y1] of bands) {
    const bandH = y1 - y0 + 1;
    // A band a couple of pixels tall is a rule or an artefact, not a line.
    if (bandH < Math.max(4, H * 0.04)) continue;

    let x0 = W;
    let x1 = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < W; x++) {
        if (!isInk(y * W + x)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
    if (x1 < x0) continue;

    // Cap line and baseline from the band's own INK PROFILE, not from the
    // modal top/bottom of each column.
    //
    // The per-column version is the obvious implementation and it is subtly
    // wrong for light weights. A column that passes through only the top
    // crossbar of a "T" has its lowest ink at the bottom of that bar, and in
    // a thin face the crossbars are long while the stems are narrow — so the
    // MODE of the per-column bottoms becomes "bottom of a crossbar" rather
    // than "baseline". Measured: Montserrat 400 read as a 21px cap height
    // instead of 234px, which then inflated its stroke ratio by 10x and made
    // a Regular look like the best match for a very heavy original.
    //
    // Counting ink per ROW instead is stable across weights: between the cap
    // line and the baseline every row is crossed by the stems, so coverage
    // sits at a plateau; above and below, only the overshoot of round letters
    // reaches, which is a small fraction of that plateau and thresholds away.
    const bandRows: number[] = [];
    for (let y = y0; y <= y1; y++) bandRows.push(rowInk[y]);
    const sorted = [...bandRows].filter((n) => n > 0).sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const plateau = Math.max(1, median * 0.3);

    let capY = y0;
    let baseY = y1;
    for (let y = y0; y <= y1; y++) {
      if (rowInk[y] >= plateau) {
        capY = y;
        break;
      }
    }
    for (let y = y1; y >= y0; y--) {
      if (rowInk[y] >= plateau) {
        baseY = y;
        break;
      }
    }
    const inkHeightPx = Math.max(1, baseY - capY + 1);

    // Per-column tops are still the right signal for "does anything rise
    // above the cap line", which is a question about individual glyphs.
    const tops: number[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (isInk(y * W + x)) {
          tops.push(y);
          break;
        }
      }
    }

    // Stem width: the modal length of horizontal ink runs. Counting every
    // run and taking the mode picks out the vertical stems (which recur once
    // per stroke, at a consistent width) over the horizontal bars and
    // diagonals (which vary).
    const runs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      let run = 0;
      for (let x = x0; x <= x1 + 1; x++) {
        const on = x <= x1 && isInk(y * W + x);
        if (on) run++;
        else {
          if (run > 0 && run < inkHeightPx) runs.push(run);
          run = 0;
        }
      }
    }
    const stem = mode(runs) || 1;
    const strokeRatio = stem / inkHeightPx;

    // All-caps reads as "almost nothing rises above the modal cap line".
    const above = tops.filter((t) => t < capY - inkHeightPx * 0.08).length;
    const isUppercase = above / Math.max(1, tops.length) < 0.05;

    // Glyph count, from vertical gaps in the line's ink. A gap only separates
    // letters if it is wide enough not to be the inside of one — the bowl of
    // an "O" leaves no full-height gap, but the space between letters does.
    const minGap = Math.max(1, Math.round(inkHeightPx * 0.06));
    let glyphCount = 0;
    let gap = 0;
    let inGlyph = false;
    for (let x = x0; x <= x1 + 1; x++) {
      let hasInk = false;
      if (x <= x1) {
        for (let y = capY; y <= baseY && !hasInk; y++) {
          if (isInk(y * W + x)) hasInk = true;
        }
      }
      if (hasInk) {
        if (!inGlyph) glyphCount++;
        inGlyph = true;
        gap = 0;
      } else if (inGlyph) {
        gap++;
        if (gap >= minGap) inGlyph = false;
      }
    }

    lines.push({
      box: [x0, y0, x1 - x0 + 1, bandH],
      inkHeightPx,
      baselineY: baseY,
      strokeRatio,
      weight: strokeRatioToWeight(strokeRatio),
      isUppercase,
      glyphCount,
    });
  }

  if (lines.length === 0) throw new Error("No text lines found in that selection.");

  return { color: avg(acc.ink), background: avg(acc.bg), lines };
}
