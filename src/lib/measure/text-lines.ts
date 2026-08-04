import { boxMean, connectedComponentBoxes, maxFilter, minFilter, type Box } from "./ops";

export interface TextLine {
  bbox: [number, number, number, number]; // x, y, w, h
}

/**
 * Text-*line* box detection without OCR. `services/analyzer` used Tesseract
 * for this, but every downstream analyzer (color, typography, layout,
 * spacing) only ever reads `TextRegion.bbox` — none of them read the
 * recognized text — so a classic gradient-based line-blob detector gives
 * the same shape of signal without a Tesseract binary, a model download, or
 * a network call:
 *
 *   morphological gradient (dilate - erode) -> local adaptive threshold ->
 *   horizontal closing (merges adjacent glyphs into line-shaped blobs) ->
 *   connected components -> filter to boxes that plausibly look like a
 *   line of text.
 *
 * Adaptive, not a single global Otsu cut: a real design with both crisp
 * black body text and a genuinely low-contrast (but still legible) heading
 * has two very different gradient magnitudes in one image. A global
 * threshold gets set by whichever is stronger and silently zeroes out the
 * other — which, for the color analyzer's whole purpose (catching exactly
 * that low-contrast text), would be a self-defeating failure mode.
 * Thresholding locally (mean + k*stddev in a neighborhood, Sauvola-style)
 * keeps both.
 *
 * This is a proxy for "text-shaped region", same as it was before —
 * confidence in the exact box, not the presence of a real deterministic
 * signal, is what's traded away.
 */
export function detectTextLines(gray: ArrayLike<number>, width: number, height: number): TextLine[] {
  const dilated = maxFilter(gray, width, height, 3, 3);
  const eroded = minFilter(gray, width, height, 3, 3);
  const gradient = new Float32Array(width * height);
  for (let i = 0; i < gradient.length; i++) gradient[i] = dilated[i] - eroded[i];

  const win = Math.max(15, Math.round(Math.min(width, height) * 0.03));
  const localMean = boxMean(gradient, width, height, win);
  const gradSq = new Float64Array(gradient.length);
  for (let i = 0; i < gradient.length; i++) gradSq[i] = gradient[i] * gradient[i];
  const localMeanSq = boxMean(gradSq, width, height, win);

  const K = 0.6;
  const FLOOR = 10; // absolute gradient floor — keeps flat/uniform regions quiet
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < binary.length; i++) {
    const variance = Math.max(0, localMeanSq[i] - localMean[i] * localMean[i]);
    const threshold = Math.max(localMean[i] + K * Math.sqrt(variance), FLOOR);
    binary[i] = gradient[i] > threshold ? 255 : 0;
  }

  // Horizontal closing: merges the gaps between characters/words on the
  // same line into one blob, while a shallow vertical kernel keeps separate
  // lines from fusing together.
  const closeW = Math.max(9, Math.round(width * 0.008));
  const closed1 = maxFilter(binary, width, height, closeW, 3);
  const closed = minFilter(closed1, width, height, closeW, 3);

  const boxes = connectedComponentBoxes(closed, width, height);
  return boxes.filter((b) => plausibleTextLine(b, width, height)).map((b) => ({
    bbox: [b.x, b.y, b.w, b.h] as [number, number, number, number],
  }));
}

function plausibleTextLine(b: Box, imgW: number, imgH: number): boolean {
  if (b.h < 6 || b.h > imgH * 0.15) return false;
  if (b.w < b.h * 0.6) return false; // rules out near-square noise blobs
  const fill = b.area / (b.w * b.h);
  if (fill < 0.08 || fill > 0.9) return false;
  if (b.w * b.h < 0.00005 * imgW * imgH) return false; // specks
  return true;
}
