import { boxMean, connectedComponentBoxes, maxFilter, minFilter, type Box } from "@/lib/measure/ops";
import { TEXT_RELAXED_MAX_HEIGHT_FRAC, TEXT_RELAXED_MIN_WIDTH_RATIO } from "./constants";

/**
 * A relaxed variant of src/lib/measure/text-lines.ts's detectTextLines,
 * NOT a change to that shipped analyzer — critique/identify/originality
 * keep their tighter defaults (max 15% of image height, min width 0.6x
 * height) unchanged, tuned for body copy. Rebuild needs to see poster
 * headlines (routinely >15% of canvas height) and single-character
 * logotypes (narrower than 0.6x their own height), so this widens exactly
 * those two constraints and nothing else in the pipeline — same
 * morphological-gradient detector, same adaptive threshold, same
 * horizontal-closing step.
 */
export function detectTextLinesRelaxed(gray: ArrayLike<number>, width: number, height: number): Box[] {
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
  const FLOOR = 10;
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < binary.length; i++) {
    const variance = Math.max(0, localMeanSq[i] - localMean[i] * localMean[i]);
    const threshold = Math.max(localMean[i] + K * Math.sqrt(variance), FLOOR);
    binary[i] = gradient[i] > threshold ? 255 : 0;
  }

  const closeW = Math.max(9, Math.round(width * 0.008));
  const closed1 = maxFilter(binary, width, height, closeW, 3);
  const closed = minFilter(closed1, width, height, closeW, 3);

  const boxes = connectedComponentBoxes(closed, width, height);
  return boxes.filter((b) => plausibleRelaxed(b, width, height));
}

function plausibleRelaxed(b: Box, imgW: number, imgH: number): boolean {
  if (b.h < 6 || b.h > imgH * TEXT_RELAXED_MAX_HEIGHT_FRAC) return false;
  if (b.w < b.h * TEXT_RELAXED_MIN_WIDTH_RATIO) return false;
  const fill = b.area / (b.w * b.h);
  if (fill < 0.08 || fill > 0.9) return false;
  if (b.w * b.h < 0.00005 * imgW * imgH) return false;
  return true;
}
