import { detectContentBoxes } from "../content-boxes";
import type { Box } from "../ops";
import type { TextLine } from "../text-lines";

/**
 * Shared by layout.ts and spacing.ts (their Python originals duplicated this
 * same selection logic independently): prefer OCR/text-line boxes when
 * there are enough of them — more reliable edges than generic contour
 * detection for text-heavy designs — otherwise fall back to generic content
 * blocks.
 */
export function selectBoxes(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  textLines: TextLine[],
): Box[] {
  if (textLines.length >= 4) {
    return textLines.map((r) => ({
      x: Math.round(r.bbox[0]),
      y: Math.round(r.bbox[1]),
      w: Math.round(r.bbox[2]),
      h: Math.round(r.bbox[3]),
      area: Math.round(r.bbox[2]) * Math.round(r.bbox[3]),
    }));
  }
  return detectContentBoxes(gray, width, height);
}
