import { kmeans2 } from "@/lib/measure/ops";

export interface Palette {
  r: number;
  g: number;
  b: number;
}

export interface QuantizedImage {
  /**
   * Palette index per pixel, row-major, WITH a 1-cell border of -1 on every
   * side — matches ImageTracer's own array shape. The border matters:
   * without it, a shape touching the canvas edge would have no boundary to
   * trace on that side, since every neighbor comparison in layeringStep
   * needs something (even if only "outside the canvas") to differ from.
   */
  indexed: Int16Array;
  /** Row stride of `indexed` — image width + 2. */
  stride: number;
  /** Row count of `indexed` — image height + 2. */
  rows: number;
  palette: Palette[];
}

// Fitting k-means centers on every pixel of a 1600px-edge image (up to 2.56M
// samples) is unnecessary work repeated for no benefit — a deterministic
// grid subsample is enough to place the centers well, and the *assignment*
// pass below still runs over every pixel so no image detail is lost from
// the actual quantization. Grid, not random, for the same reason kmeans2
// itself uses deterministic seeding: a rebuild run must be reproducible.
const TARGET_FIT_SAMPLES = 20000;

/**
 * Reduces `rgb` (w*h*3 from decodeForMeasurement) to a palette of up to `k`
 * colors using this repo's existing kmeans2 (src/lib/measure/ops.ts —
 * deterministic maximin seeding for k>2) instead of porting ImageTracer's
 * own color quantizer. Every pixel is then assigned to its nearest palette
 * color by rectilinear distance, matching ImageTracer's own
 * colorquantization() comment that rectilinear "works better than
 * Euclidean" for this.
 */
export function quantizeImage(rgb: Uint8ClampedArray, width: number, height: number, k = 16): QuantizedImage {
  const n = width * height;
  const kClamped = Math.max(2, Math.min(k, n));

  const step = Math.max(1, Math.floor(Math.sqrt(n / TARGET_FIT_SAMPLES)));
  const samples: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 3;
      samples.push(rgb[idx], rgb[idx + 1], rgb[idx + 2]);
    }
  }
  const { centers } = kmeans2(new Float32Array(samples), kClamped, 12);
  const palette: Palette[] = centers.map((c) => ({ r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) }));

  const stride = width + 2;
  const rows = height + 2;
  const indexed = new Int16Array(stride * rows).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = rgb[idx], g = rgb[idx + 1], b = rgb[idx + 2];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < palette.length; c++) {
        const d = Math.abs(palette[c].r - r) + Math.abs(palette[c].g - g) + Math.abs(palette[c].b - b);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      indexed[(y + 1) * stride + (x + 1)] = best;
    }
  }

  return { indexed, stride, rows, palette };
}
