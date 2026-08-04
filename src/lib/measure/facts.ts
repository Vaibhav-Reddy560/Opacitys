import { kmeans2, spectralResidualSaliency, wcagContrast, type Box } from "./ops";
import { selectBoxes } from "./analyzers/_boxes";
import type { TextLine } from "./text-lines";

/**
 * Raw descriptive measurements — unlike the analyzers in `analyzers/*.ts`,
 * these are reported unconditionally, not only when something falls outside
 * an expected range. Critique needs "what's wrong"; Identify and
 * Originality need "what's actually here" even on a design with nothing
 * wrong at all, since a style read has to work regardless of whether the
 * design happens to trip a contrast or alignment threshold.
 */
export interface MeasuredFacts {
  /** Up to 3 dominant colors across the whole image, as hex strings. */
  dominantColors: string[];
  /** Average text-vs-local-background WCAG contrast across detected text
   * lines — null if no text was detected. */
  avgTextContrast: number | null;
  /** Fraction of content blocks that share an edge with another — same
   * metric as the layout analyzer, reported regardless of threshold. */
  alignmentRatio: number | null;
  /** Coefficient of variation of gaps between content blocks. */
  gapCoefficientOfVariation: number | null;
  /** Fraction of saliency mass in the top 40% of the canvas. */
  topBandSaliencyShare: number | null;
  /** Distinct type-size clusters detected among text lines. */
  distinctTypeSizes: number | null;
  textLineCount: number;
}

function rgbToHex([r, g, b]: number[]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function dominantColors(rgb: Uint8ClampedArray, width: number, height: number, k = 3): string[] {
  const n = width * height;
  // Sample every Nth pixel — full-resolution k-means over a 1600px image is
  // unnecessary work for a 3-color palette read.
  const stride = Math.max(1, Math.floor(n / 4000));
  const sampled: number[] = [];
  for (let i = 0; i < n; i += stride) {
    sampled.push(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  }
  const { centers, counts } = kmeans2(Float32Array.from(sampled), k);
  return centers.filter((_, i) => counts[i] > 0).map(rgbToHex);
}

function avgTextContrast(rgb: Uint8ClampedArray, width: number, height: number, textLines: TextLine[]): number | null {
  if (textLines.length === 0) return null;
  let total = 0;
  let n = 0;
  for (const region of textLines) {
    let [x, y, rw, rh] = region.bbox.map((v) => Math.round(v));
    x = Math.max(0, x);
    y = Math.max(0, y);
    rw = Math.max(1, Math.min(rw, width - x));
    rh = Math.max(1, Math.min(rh, height - y));
    const pad = Math.max(4, Math.floor(rh / 2));
    const y0 = Math.max(0, y - pad);
    const y1 = Math.min(height, y + rh + pad);
    const x0 = Math.max(0, x - pad);
    const x1 = Math.min(width, x + rw + pad);
    if (y1 <= y0 || x1 <= x0) continue;

    const patchW = x1 - x0;
    const patchH = y1 - y0;
    const pixels = new Float32Array(patchW * patchH * 3);
    let idx = 0;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const src = (py * width + px) * 3;
        pixels[idx++] = rgb[src];
        pixels[idx++] = rgb[src + 1];
        pixels[idx++] = rgb[src + 2];
      }
    }
    const { centers } = kmeans2(pixels, 2);
    total += wcagContrast(centers[0], centers[1]);
    n++;
  }
  return n > 0 ? Math.round((total / n) * 100) / 100 : null;
}

function alignmentRatio(boxes: Box[]): number | null {
  if (boxes.length < 3) return null;
  const tolX = 0.01;
  const tolY = 0.01;
  let aligned = 0;
  for (let i = 0; i < boxes.length; i++) {
    const { x, y, w } = boxes[i];
    let has = false;
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const o = boxes[j];
      if (Math.abs(x - o.x) <= tolX || Math.abs(x + w - (o.x + o.w)) <= tolX || Math.abs(y - o.y) <= tolY) {
        has = true;
        break;
      }
    }
    if (has) aligned++;
  }
  return Math.round((aligned / boxes.length) * 100) / 100;
}

function gapCV(boxes: Box[]): number | null {
  if (boxes.length < 4) return null;
  const gaps: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    let best: number | null = null;
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const o = boxes[j];
      const dx = Math.max(o.x - (box.x + box.w), box.x - (o.x + o.w), 0);
      const dy = Math.max(o.y - (box.y + box.h), box.y - (o.y + o.h), 0);
      const gap = dx > dy ? dx : dy;
      if (gap <= 0) continue;
      if (best === null || gap < best) best = gap;
    }
    if (best !== null) gaps.push(best);
  }
  if (gaps.length < 3) return null;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return 0;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  return Math.round((Math.sqrt(variance) / mean) * 100) / 100;
}

function topBandSaliencyShare(gray: ArrayLike<number>, width: number, height: number): number | null {
  if (width < 16 || height < 16) return null;
  const salMap = spectralResidualSaliency(gray, width, height);
  let total = 0;
  for (let i = 0; i < salMap.length; i++) total += salMap[i];
  if (total <= 0) return null;
  const bandH = Math.floor(height * 0.4);
  let topMass = 0;
  for (let y = 0; y < bandH; y++) {
    for (let x = 0; x < width; x++) topMass += salMap[y * width + x];
  }
  return Math.round((topMass / total) * 100) / 100;
}

function distinctTypeSizes(textLines: TextLine[]): number | null {
  if (textLines.length < 3) return null;
  const heights = textLines.map((r) => r.bbox[3]).sort((a, b) => a - b);
  const clusters: number[][] = [[heights[0]]];
  for (let i = 1; i < heights.length; i++) {
    const last = clusters[clusters.length - 1];
    if (heights[i] - last[last.length - 1] <= 3) last.push(heights[i]);
    else clusters.push([heights[i]]);
  }
  return clusters.length;
}

export function computeFacts(
  rgb: Uint8ClampedArray,
  gray: ArrayLike<number>,
  width: number,
  height: number,
  textLines: TextLine[],
): MeasuredFacts {
  const boxes = selectBoxes(gray, width, height, textLines);
  return {
    dominantColors: dominantColors(rgb, width, height),
    avgTextContrast: avgTextContrast(rgb, width, height, textLines),
    alignmentRatio: alignmentRatio(boxes),
    gapCoefficientOfVariation: gapCV(boxes),
    topBandSaliencyShare: topBandSaliencyShare(gray, width, height),
    distinctTypeSizes: distinctTypeSizes(textLines),
    textLineCount: textLines.length,
  };
}
