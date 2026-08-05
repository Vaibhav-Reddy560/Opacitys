import { maxFilter, minFilter, kmeans2 } from "../ops";
import { newFindingId } from "../id";
import { SKIPPED, measured, type AnalyzerResult } from "./_result";

/**
 * Restraint analyzer: how many genuinely distinct colors does the design
 * carry? Maeda (Laws of Simplicity, Law 1 — Reduce: "when in doubt,
 * remove"), Lidwell et al. (Universal Principles, Ockham's Razor:
 * "unnecessary elements decrease a design's efficiency"), Airey (Logo
 * Design Love, the Principle of One Thing: "if you have a clever icon,
 * keep the typography simple").
 *
 * Ships as a single measure — distinct dominant colors — rather than a
 * composite "restraint index" of palette size + element count + edge
 * density: a composite number can't be explained or defended (the finding
 * card literally renders `measured.value + unit` under a heading that says
 * "The evidence"), and element count would just be text-line count in
 * practice (`_boxes.ts` returns text lines whenever there are ≥4).
 *
 * Two independent gates before this ever fires, because this runs on
 * arbitrary uploads and photographs naturally have many dominant colors —
 * that's not a restraint problem, it's a photograph:
 *   1. Flat-pixel share ≥ 0.55 — most of the canvas has to be low local
 *      gradient (the same morphological-gradient technique text-lines.ts
 *      uses to find text), which graphic work has (large uniform fills)
 *      and photography mostly doesn't.
 *   2. Top color share ≥ 0.20 — every real design has a ground; a photo
 *      rarely has one color occupying a fifth of the frame.
 */
const FLAT_GRADIENT_MAX = 8; // 0-255 morphological gradient (hi - lo)
const MIN_FLAT_SHARE = 0.55;
const MIN_TOP_SHARE = 0.2;
const COLOR_DISTANCE = 60; // RGB euclidean distance below which two centers count as one color
const MIN_COLOR_SHARE = 0.05;
const EXPECTED_COLORS: [number, number] = [1, 4];

function sampleRgb(rgb: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height;
  const stride = Math.max(1, Math.floor(n / 4000));
  const sampled: number[] = [];
  for (let i = 0; i < n; i += stride) {
    sampled.push(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }
  return Float32Array.from(sampled);
}

function rgbDistance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function analyzeRestraint(
  rgb: Uint8ClampedArray,
  gray: ArrayLike<number>,
  width: number,
  height: number,
): AnalyzerResult {
  const hi = maxFilter(gray, width, height, 3, 3);
  const lo = minFilter(gray, width, height, 3, 3);
  let flat = 0;
  for (let i = 0; i < hi.length; i++) if (hi[i] - lo[i] <= FLAT_GRADIENT_MAX) flat++;
  if (flat / hi.length < MIN_FLAT_SHARE) return SKIPPED; // photographic — not a restraint claim

  const { centers, counts } = kmeans2(sampleRgb(rgb, width, height), 8);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0 || counts[0] / total < MIN_TOP_SHARE) return SKIPPED; // no dominant ground

  // centers arrive ordered by descending membership; keep one only if it
  // carries real area AND is a genuinely different color from every kept one.
  const kept: number[][] = [];
  for (let i = 0; i < centers.length; i++) {
    if (counts[i] / total < MIN_COLOR_SHARE) continue;
    if (kept.every((k) => rgbDistance(k, centers[i]) >= COLOR_DISTANCE)) kept.push(centers[i]);
  }

  const [elo, ehi] = EXPECTED_COLORS;
  if (kept.length <= ehi) return measured();

  return measured([
    {
      id: newFindingId(),
      dimension: "restraint",
      severity: kept.length >= 7 ? "major" : "minor",
      // A palette claim is about the whole canvas, not a place on it — the
      // only analyzer where that's true.
      bbox: [0, 0, width, height],
      measured: { value: kept.length, expected: [elo, ehi], unit: " dominant colors" },
    },
  ]);
}
