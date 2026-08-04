import { canny, connectedComponentBoxes, maxFilter, type Box } from "./ops";

/**
 * Coarse content-block detection via edge detection + dilation + connected
 * components. Direct port of `services/analyzer/shared.py`'s
 * `detect_content_boxes` — a proxy for "distinct visual elements", used by
 * layout/spacing when there isn't enough detected text to use text-line
 * boxes instead.
 */
export function detectContentBoxes(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  minAreaFrac = 0.001,
): Box[] {
  const edges = canny(gray, width, height, 40, 120);
  const dilated = maxFilter(edges, width, height, 9, 9);
  const boxes = connectedComponentBoxes(dilated, width, height);
  const minArea = minAreaFrac * width * height;
  return boxes.filter((b) => b.w * b.h >= minArea);
}
