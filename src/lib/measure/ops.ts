/**
 * Numerical primitives the analyzers are built from — a small, dependency-
 * free port of the specific OpenCV/scikit-image/numpy operations
 * `services/analyzer` used (gaussian blur, Sobel, Canny, morphology,
 * connected components, k-means, WCAG contrast, spectral-residual
 * saliency). Not a general CV library — each function does exactly what its
 * one caller in `analyzers/*.ts` needs, matching the reference
 * implementation's parameters (kernel sizes, thresholds) so severities and
 * expected ranges carried over from the Python analyzers stay meaningful.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Actual foreground pixel count in the component (<= w*h). */
  area: number;
}

// ---------------------------------------------------------------------------
// Rank filters (grayscale dilate/erode are just max/min over a window — the
// same function serves binary 0/255 images too, which is all shared.py's
// `detect_content_boxes` needs from "dilate").
// ---------------------------------------------------------------------------

export function maxFilter(
  data: ArrayLike<number>,
  width: number,
  height: number,
  kw: number,
  kh: number,
): Float32Array {
  return rankFilter(data, width, height, kw, kh, -Infinity, Math.max);
}

export function minFilter(
  data: ArrayLike<number>,
  width: number,
  height: number,
  kw: number,
  kh: number,
): Float32Array {
  return rankFilter(data, width, height, kw, kh, Infinity, Math.min);
}

function rankFilter(
  data: ArrayLike<number>,
  width: number,
  height: number,
  kw: number,
  kh: number,
  identity: number,
  pick: (a: number, b: number) => number,
): Float32Array {
  const rx = Math.floor(kw / 2);
  const ry = Math.floor(kh / 2);
  // Separable pass: horizontal then vertical. Exact for max/min (unlike sum).
  const horiz = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = identity;
      const x0 = Math.max(0, x - rx);
      const x1 = Math.min(width - 1, x + rx);
      for (let xx = x0; xx <= x1; xx++) acc = pick(acc, data[row + xx]);
      horiz[row + x] = acc;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - ry);
    const y1 = Math.min(height - 1, y + ry);
    for (let x = 0; x < width; x++) {
      let acc = identity;
      for (let yy = y0; yy <= y1; yy++) acc = pick(acc, horiz[yy * width + x]);
      out[y * width + x] = acc;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gaussian blur — separable, sigma computed the way OpenCV derives it from
// ksize when sigma=0 (`cv2.GaussianBlur(gray, (5,5), 0)`).
// ---------------------------------------------------------------------------

function gaussianKernel1d(ksize: number): Float64Array {
  const sigma = 0.3 * ((ksize - 1) * 0.5 - 1) + 0.8;
  const k = new Float64Array(ksize);
  const r = Math.floor(ksize / 2);
  let sum = 0;
  for (let i = 0; i < ksize; i++) {
    const x = i - r;
    const v = Math.exp(-(x * x) / (2 * sigma * sigma));
    k[i] = v;
    sum += v;
  }
  for (let i = 0; i < ksize; i++) k[i] /= sum;
  return k;
}

export function gaussianBlur(
  data: ArrayLike<number>,
  width: number,
  height: number,
  ksize = 5,
): Float32Array {
  const kernel = gaussianKernel1d(ksize);
  const r = Math.floor(ksize / 2);
  const horiz = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(width - 1, Math.max(0, x + i));
        acc += data[row + xx] * kernel[i + r];
      }
      horiz[row + x] = acc;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(height - 1, Math.max(0, y + i));
        acc += horiz[yy * width + x] * kernel[i + r];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sobel gradient magnitude + direction.
// ---------------------------------------------------------------------------

export function sobel(
  data: ArrayLike<number>,
  width: number,
  height: number,
): { magnitude: Float32Array; direction: Float32Array } {
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  const at = (x: number, y: number) => {
    const xx = Math.min(width - 1, Math.max(0, x));
    const yy = Math.min(height - 1, Math.max(0, y));
    return data[yy * width + xx];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const i = y * width + x;
      magnitude[i] = Math.hypot(gx, gy);
      direction[i] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, direction };
}

// ---------------------------------------------------------------------------
// Canny edge detector — gaussian blur -> Sobel -> non-max suppression ->
// hysteresis threshold. Mirrors `cv2.Canny(blurred, 40, 120)`.
// ---------------------------------------------------------------------------

export function canny(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  low = 40,
  high = 120,
): Uint8Array {
  const blurred = gaussianBlur(gray, width, height, 5);
  const { magnitude, direction } = sobel(blurred, width, height);

  // Non-maximum suppression: keep a pixel only if it's a local max along its
  // gradient direction, rounded to one of 4 sectors (0/45/90/135deg).
  const suppressed = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const angle = (((direction[i] * 180) / Math.PI) + 180) % 180;
      let n1: number, n2: number;
      if (angle < 22.5 || angle >= 157.5) {
        n1 = magnitude[i - 1];
        n2 = magnitude[i + 1];
      } else if (angle < 67.5) {
        n1 = magnitude[i - width + 1];
        n2 = magnitude[i + width - 1];
      } else if (angle < 112.5) {
        n1 = magnitude[i - width];
        n2 = magnitude[i + width];
      } else {
        n1 = magnitude[i - width - 1];
        n2 = magnitude[i + width + 1];
      }
      suppressed[i] = magnitude[i] >= n1 && magnitude[i] >= n2 ? magnitude[i] : 0;
    }
  }

  // Hysteresis: strong pixels seed a flood-fill that also claims connected
  // weak pixels; anything else is dropped.
  const STRONG = 2;
  const WEAK = 1;
  const state = new Uint8Array(width * height);
  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] >= high) state[i] = STRONG;
    else if (suppressed[i] >= low) state[i] = WEAK;
  }

  const out = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let i = 0; i < state.length; i++) {
    if (state[i] === STRONG && out[i] === 0) {
      out[i] = 255;
      stack.push(i);
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
        const j = yy * width + xx;
        if (out[j] === 0 && state[j] === WEAK) {
          out[j] = 255;
          stack.push(j);
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Otsu threshold — standard 256-bin between-class-variance maximization.
// ---------------------------------------------------------------------------

export function otsuThreshold(data: ArrayLike<number>, max = 255): number {
  const hist = new Float64Array(256);
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round((data[i] / max) * 255)));
    hist[v]++;
    n++;
  }
  if (n === 0) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return (best / 255) * max;
}

// ---------------------------------------------------------------------------
// Connected components (8-connectivity) over a binary (nonzero) mask ->
// bounding boxes. Stands in for `cv2.findContours(...).boundingRect()`.
// ---------------------------------------------------------------------------

export function connectedComponentBoxes(
  binary: ArrayLike<number>,
  width: number,
  height: number,
): Box[] {
  const visited = new Uint8Array(width * height);
  const boxes: Box[] = [];
  const stack: number[] = [];

  for (let start = 0; start < width * height; start++) {
    if (visited[start] || !binary[start]) continue;
    visited[start] = 1;
    stack.push(start);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let area = 0;

    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
          const j = yy * width + xx;
          if (!visited[j] && binary[j]) {
            visited[j] = 1;
            stack.push(j);
          }
        }
      }
    }

    boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }

  return boxes;
}

// ---------------------------------------------------------------------------
// k-means, matching `cv2.kmeans(..., k=2, KMEANS_PP_CENTERS)` closely enough
// for a "text ink vs local background" 2-cluster split: deterministic init
// from the extremes of the sample (not random — the caller needs
// reproducible contrast readings), a handful of Lloyd iterations, and
// clusters returned ordered by descending membership like the Python code's
// `order = argsort(-counts)`.
//
// For k>2 (only the restraint analyzer's palette count calls this), extra
// centers are seeded by farthest-point (maximin): each one is the sample
// furthest from every center chosen so far. An earlier version seeded extras
// as copies of centers[0] — duplicate centers never separate under Lloyd's
// algorithm (they move identically every iteration since they start with
// identical assignments), so k=6 and k=8 both collapsed to 3 real clusters
// on 6 perfectly-separated synthetic colors, verified with a standalone
// harness. Maximin recovers all 6. k=2 is unaffected — the loop below is a
// no-op when k=2, so this is a strict fix, not a behavior change, for the
// only caller (color.ts) that has ever used this at k=2.
// ---------------------------------------------------------------------------

export function kmeans2(
  pixels: Float32Array, // N*3, RGB
  k = 2,
  iterations = 12,
): { centers: number[][]; counts: number[] } {
  const n = pixels.length / 3;
  if (n === 0) return { centers: Array.from({ length: k }, () => [0, 0, 0]), counts: Array(k).fill(0) };
  if (n < k) {
    const c = [pixels[0], pixels[1], pixels[2]];
    return { centers: Array.from({ length: k }, () => c.slice()), counts: [n, ...Array(k - 1).fill(0)] };
  }

  // Deterministic seed: the two samples furthest apart in luminance.
  let loIdx = 0, hiIdx = 0, loLum = Infinity, hiLum = -Infinity;
  for (let i = 0; i < n; i++) {
    const lum = 0.299 * pixels[i * 3] + 0.587 * pixels[i * 3 + 1] + 0.114 * pixels[i * 3 + 2];
    if (lum < loLum) { loLum = lum; loIdx = i; }
    if (lum > hiLum) { hiLum = lum; hiIdx = i; }
  }
  const centers: number[][] = [
    [pixels[loIdx * 3], pixels[loIdx * 3 + 1], pixels[loIdx * 3 + 2]],
    [pixels[hiIdx * 3], pixels[hiIdx * 3 + 1], pixels[hiIdx * 3 + 2]],
  ];
  while (centers.length < k) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < n; i++) {
      let nearest = Infinity;
      for (const c of centers) {
        const dr = pixels[i * 3] - c[0];
        const dg = pixels[i * 3 + 1] - c[1];
        const db = pixels[i * 3 + 2] - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDist) { bestDist = nearest; bestIdx = i; }
    }
    centers.push([pixels[bestIdx * 3], pixels[bestIdx * 3 + 1], pixels[bestIdx * 3 + 2]]);
  }

  const labels = new Int32Array(n);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = pixels[i * 3] - centers[c][0];
        const dg = pixels[i * 3 + 1] - centers[c][1];
        const db = pixels[i * 3 + 2] - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) { bestDist = d; best = c; }
      }
      labels[i] = best;
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      sums[c][0] += pixels[i * 3];
      sums[c][1] += pixels[i * 3 + 1];
      sums[c][2] += pixels[i * 3 + 2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centers[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
      }
    }
  }

  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[labels[i]]++;
  const order = counts.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
  return { centers: order.map((i) => centers[i]), counts: order.map((i) => counts[i]) };
}

// ---------------------------------------------------------------------------
// WCAG relative luminance / contrast ratio — direct port of shared.py.
// ---------------------------------------------------------------------------

export function relativeLuminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const srgb = v / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function wcagContrast(a: number[], b: number[]): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Spectral-residual saliency (Hou & Zhang, 2007) — the same algorithm behind
// `cv2.saliency.StaticSaliencySpectralResidual`: FFT the (downsampled)
// image, subtract a smoothed copy of the log-amplitude spectrum from
// itself (the "residual" — what's *not* generic/expected in this image's
// frequency content), invert, square. Computed at 64x64 since only the
// coarse distribution across the canvas is used (top-band share), not
// pixel-precise saliency.
// ---------------------------------------------------------------------------

const SALIENCY_SIZE = 64;

function fft1d(re: Float64Array, im: Float64Array, invert: boolean) {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 1 : -1) * 2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array, size: number, invert: boolean) {
  const rowRe = new Float64Array(size);
  const rowIm = new Float64Array(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rowRe[x] = re[y * size + x];
      rowIm[x] = im[y * size + x];
    }
    fft1d(rowRe, rowIm, invert);
    for (let x = 0; x < size; x++) {
      re[y * size + x] = rowRe[x];
      im[y * size + x] = rowIm[x];
    }
  }
  const colRe = new Float64Array(size);
  const colIm = new Float64Array(size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      colRe[y] = re[y * size + x];
      colIm[y] = im[y * size + x];
    }
    fft1d(colRe, colIm, invert);
    for (let y = 0; y < size; y++) {
      re[y * size + x] = colRe[y];
      im[y * size + x] = colIm[y];
    }
  }
}

function resizeBilinear(
  data: ArrayLike<number>,
  width: number,
  height: number,
  outW: number,
  outH: number,
): Float32Array {
  const out = new Float32Array(outW * outH);
  const sx = width / outW;
  const sy = height / outH;
  for (let y = 0; y < outH; y++) {
    const srcY = Math.min(height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(srcY));
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < outW; x++) {
      const srcX = Math.min(width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(srcX));
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = srcX - x0;
      const v00 = data[y0 * width + x0];
      const v01 = data[y0 * width + x1];
      const v10 = data[y1 * width + x0];
      const v11 = data[y1 * width + x1];
      const top = v00 + (v01 - v00) * fx;
      const bot = v10 + (v11 - v10) * fx;
      out[y * outW + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

export function spectralResidualSaliency(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const small = resizeBilinear(gray, width, height, SALIENCY_SIZE, SALIENCY_SIZE);
  const n = SALIENCY_SIZE * SALIENCY_SIZE;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = small[i];

  fft2d(re, im, SALIENCY_SIZE, false);

  const logAmp = new Float64Array(n);
  const phase = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const amp = Math.hypot(re[i], im[i]);
    logAmp[i] = Math.log(amp + 1e-8);
    phase[i] = Math.atan2(im[i], re[i]);
  }

  const smoothed = boxBlurFloat(logAmp, SALIENCY_SIZE, SALIENCY_SIZE, 3);
  const residual = new Float64Array(n);
  for (let i = 0; i < n; i++) residual[i] = logAmp[i] - smoothed[i];

  for (let i = 0; i < n; i++) {
    const mag = Math.exp(residual[i]);
    re[i] = mag * Math.cos(phase[i]);
    im[i] = mag * Math.sin(phase[i]);
  }

  fft2d(re, im, SALIENCY_SIZE, true);

  const saliencySmall = new Float32Array(n);
  for (let i = 0; i < n; i++) saliencySmall[i] = re[i] * re[i] + im[i] * im[i];

  const blurredSmall = gaussianBlur(saliencySmall, SALIENCY_SIZE, SALIENCY_SIZE, 5);
  return resizeBilinear(blurredSmall, SALIENCY_SIZE, SALIENCY_SIZE, width, height);
}

/** Uniform local-average filter (not gaussian-weighted) — used for local
 * adaptive thresholding, where a true box mean is what the statistics call
 * for. */
export function boxMean(data: ArrayLike<number>, width: number, height: number, ksize: number): Float64Array {
  return boxBlurFloat(data, width, height, ksize);
}

function boxBlurFloat(data: ArrayLike<number>, width: number, height: number, ksize: number): Float64Array {
  const r = Math.floor(ksize / 2);
  const horiz = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0, count = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= width) continue;
        acc += data[row + xx];
        count++;
      }
      horiz[row + x] = acc / count;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0, count = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy < 0 || yy >= height) continue;
        acc += horiz[yy * width + x];
        count++;
      }
      out[y * width + x] = acc / count;
    }
  }
  return out;
}
