/**
 * Ported from ImageTracer.js v1.2.6's layeringstep() (Unlicense / public
 * domain — see pathscan.ts for the full attribution note). A marching-
 * squares edge encoding: for one palette color, every node in the padded
 * (width+2 x height+2) grid gets a 0-15 value encoding which of its four
 * surrounding pixels belong to that color. pathscan.ts's lookup table turns
 * this into closed boundary paths.
 */

/**
 * `indexed` is a palette-index grid with a 1-cell border of -1 on every
 * side (see quantize.ts) — `stride` is its row width (image width + 2) and
 * `rows` its row count (image height + 2). Returns a same-shaped grid of
 * edge-node types for just `colorIndex`.
 */
export function layeringStep(
  indexed: Int16Array,
  stride: number,
  rows: number,
  colorIndex: number,
): Uint8Array {
  const layer = new Uint8Array(stride * rows);
  for (let j = 1; j < rows; j++) {
    for (let i = 1; i < stride; i++) {
      const v =
        (indexed[(j - 1) * stride + (i - 1)] === colorIndex ? 1 : 0) +
        (indexed[(j - 1) * stride + i] === colorIndex ? 2 : 0) +
        (indexed[j * stride + (i - 1)] === colorIndex ? 8 : 0) +
        (indexed[j * stride + i] === colorIndex ? 4 : 0);
      layer[j * stride + i] = v;
    }
  }
  return layer;
}
