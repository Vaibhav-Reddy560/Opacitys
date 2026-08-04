/**
 * Pure signed-distance-field pipeline for the glass wordmark. No DOM access —
 * this file is imported by both the main thread (inline fallback) and
 * `sdf.worker.ts`, so it stays free of `window`/`document`/`canvas`.
 *
 * Pipeline: binary mask -> two squared-EDT passes -> signed float field ->
 * (optional 2x box-downsample) -> analytic gradient -> stroke-radius estimate
 * -> pack into an RGBA8 texture. See the plan file for the derivations behind
 * the choices below; the short version is repeated inline at each step.
 */

import type { DistanceField, GlyphField, RadiusEstimate, SdfRequest, SdfResponse } from "./types";

const INF = 1e20;

/**
 * Felzenszwalb & Huttenlocher's lower-envelope-of-parabolas 1D squared
 * distance transform. Exactly exact (unlike 8SSEDT, which is an
 * approximation), O(n), and separable — this is what makes the 2D transform
 * below two linear passes instead of an iterative propagation.
 *
 * `d`, `v`, `z` are caller-owned scratch buffers (length n, n, n+1) so a
 * whole-image transform doesn't allocate per row/column.
 */
function distSqr1D(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array): void {
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  let k = 0;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * 2D squared Euclidean distance transform: every pixel gets its squared
 * distance to the nearest pixel where `mask === seedValue`. Column pass then
 * row pass, each a `distSqr1D` scan — O(width*height) total.
 */
function squaredEDT2D(mask: Uint8Array, width: number, height: number, seedValue: 0 | 1): Float32Array {
  const size = width * height;
  const g = new Float32Array(size);

  const colF = new Float32Array(height);
  const colD = new Float32Array(height);
  const colV = new Int32Array(height);
  const colZ = new Float32Array(height + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      colF[y] = mask[y * width + x] === seedValue ? 0 : INF;
    }
    distSqr1D(colF, height, colD, colV, colZ);
    for (let y = 0; y < height; y++) g[y * width + x] = colD[y];
  }

  const rowF = new Float32Array(width);
  const rowD = new Float32Array(width);
  const rowV = new Int32Array(width);
  const rowZ = new Float32Array(width + 1);
  const out = new Float32Array(size);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width; x++) rowF[x] = g[base + x];
    distSqr1D(rowF, width, rowD, rowV, rowZ);
    for (let x = 0; x < width; x++) out[base + x] = rowD[x];
  }
  return out;
}

/**
 * Signed field, positive inside. Two EDT passes:
 *  - seeds = outside pixels -> for inside pixels, distance to the boundary
 *    from within (the "depth" of the shape at that point).
 *  - seeds = inside pixels  -> for outside pixels, distance to the boundary
 *    from without.
 * `d = sqrt(depthFromOutside) - sqrt(depthFromInside)`: positive inside
 * (depth term survives, outside term is ~0), negative outside (symmetric).
 */
export function computeSignedDistanceField(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 127,
): Float32Array {
  const size = width * height;
  const mask = new Uint8Array(size);
  for (let i = 0; i < size; i++) mask[i] = alpha[i] > threshold ? 1 : 0;

  const distToOutside = squaredEDT2D(mask, width, height, 0);
  const distToInside = squaredEDT2D(mask, width, height, 1);

  const signed = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    signed[i] = Math.sqrt(distToOutside[i]) - Math.sqrt(distToInside[i]);
  }
  return signed;
}

/**
 * Box-downsample a signed field computed at `factor`x supersample back to
 * output resolution, converting supersample-pixel units to output-pixel
 * units in the same step (divide the averaged distance by `factor`).
 *
 * This replaces the naive "d -= 0.5*sign(d)" half-pixel bias correction: a
 * 1x binary threshold loses all sub-pixel glyph geometry, while averaging
 * distances computed at 2x is visually exact and captures it.
 */
export function downsampleSignedField(
  signed: Float32Array,
  width: number,
  height: number,
  factor: number,
): DistanceField {
  const outW = Math.floor(width / factor);
  const outH = Math.floor(height / factor);
  const out = new Float32Array(outW * outH);
  const norm = 1 / (factor * factor * factor); // average (÷factor²) then unit-convert (÷factor)
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let sum = 0;
      const sx0 = ox * factor;
      const sy0 = oy * factor;
      for (let dy = 0; dy < factor; dy++) {
        const row = (sy0 + dy) * width;
        for (let dx = 0; dx < factor; dx++) {
          sum += signed[row + sx0 + dx];
        }
      }
      out[oy * outW + ox] = sum * norm;
    }
  }
  return { signed: out, width: outW, height: outH };
}

/**
 * Central-difference gradient of the float SDF, normalized to unit length.
 * Computed once on the CPU at full precision — the shader takes one texture
 * tap instead of differencing quantized 8-bit values (which is both slower
 * and noisier, especially near the medial axis where the field creases).
 */
export function computeGradient(
  signed: Float32Array,
  width: number,
  height: number,
): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y < height - 1 ? y + 1 : y;
    const dyDenom = Math.max(yp - ym, 1);
    for (let x = 0; x < width; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < width - 1 ? x + 1 : x;
      const dxDenom = Math.max(xp - xm, 1);

      const dx = (signed[y * width + xp] - signed[y * width + xm]) / dxDenom;
      const dy = (signed[yp * width + x] - signed[ym * width + x]) / dyDenom;

      let len = Math.hypot(dx, dy);
      if (len < 1e-5) len = 1e-5;
      const idx = y * width + x;
      gx[idx] = dx / len;
      gy[idx] = dy / len;
    }
  }
  return { gx, gy };
}

/**
 * Half-stroke-width `w`, derived from the field rather than hardcoded.
 *
 * For an infinite strip of half-width w, `d` is Uniform[0, w] over interior
 * pixels (P(d >= x) = 1 - x/w), so E[d] = w/2 -> w = 2*mean(d | d > 0). This
 * is the unbiased estimator: junctions (the A apex, T crossing, Y join, P
 * bowl) push a small, area-weighted fraction of pixels toward w*sqrt(2), so
 * the mean drifts only slightly high — unlike a 99th-percentile estimator,
 * which lands inside junction territory and overestimates w by 20-40%.
 *
 * Cross-checked against the independent area/perimeter estimator
 * (`area = 2wL, perimeter ~= 2L => w = area/perimeter`) and clamped to a
 * typographic prior so a pathological glyph set can't blow out the whole
 * word.
 */
export function estimateStrokeRadius(signed: Float32Array, fontSizeHintPx: number): RadiusEstimate {
  let sum = 0;
  let inside = 0;
  let edge = 0;
  for (let i = 0; i < signed.length; i++) {
    const d = signed[i];
    if (d > 0) {
      sum += d;
      inside++;
    }
    if (Math.abs(d) < 0.75) edge++;
  }
  const radiusMean = inside > 0 ? 2 * (sum / inside) : fontSizeHintPx * 0.05;
  const radiusAreaPerim = edge > 0 ? inside / edge : radiusMean;
  const combined = 0.5 * (radiusMean + radiusAreaPerim);
  const radius = Math.min(Math.max(combined, 0.018 * fontSizeHintPx), 0.14 * fontSizeHintPx);
  return { radius, radiusMean, radiusAreaPerim };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Same fract-hash family as prismatic-chrome.tsx's dither term, over a flat index. */
function hash1(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Packs the field into four *independently smooth* RGBA8 channels — never a
 * bit-packed 16-bit value. The GPU bilinear-interpolates each channel on its
 * own; packing hi/lo bytes across two channels breaks under that (wherever
 * the hi byte increments, the lo byte wraps 255->0, and bilinear across that
 * texel boundary produces a full-scale spike — a grid of one-texel slashes
 * through the glyphs). A smooth scalar field survives bilinear resampling
 * exactly, so this is the entire fix.
 *
 *   R,G = 0.5 + 0.5*normalize(grad)   (~0.45 deg angular resolution at 8-bit,
 *                                      well under the specular lobe width)
 *   B   = t = clamp(d/w, 0, 1), dithered before quantizing to break up
 *         8-bit banding near t->0, where dh/dt -> infinity
 *   A   = clamp(0.5 + d/aaRange, 0, 1) — analytic sub-pixel coverage, doubles
 *         as the shader's early-out test
 */
export function packTubeTexture(
  signed: Float32Array,
  gx: Float32Array,
  gy: Float32Array,
  width: number,
  height: number,
  radius: number,
  aaRange: number,
): Uint8Array {
  const size = width * height;
  const out = new Uint8Array(size * 4);
  const invRadius = 1 / Math.max(radius, 1e-3);
  for (let i = 0; i < size; i++) {
    const d = signed[i];
    const t = clamp01(d * invRadius);
    const dithered = clamp01(t + (hash1(i) - 0.5) / 256);
    const cov = clamp01(0.5 + d / aaRange);

    const o = i * 4;
    out[o + 0] = Math.round((0.5 + 0.5 * gx[i]) * 255);
    out[o + 1] = Math.round((0.5 + 0.5 * gy[i]) * 255);
    out[o + 2] = Math.round(dithered * 255);
    out[o + 3] = Math.round(cov * 255);
  }
  return out;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Top-level orchestration: raw supersampled alpha -> packed GlyphField. Pure
 * and synchronous — called directly by the worker, and inline (at reduced
 * supersample) as the no-worker fallback. `AA_RANGE` is fixed at 6 output px
 * so the shader's `uAaRange` default can be a compile-time constant that
 * matches the texture without a uniform round-trip.
 */
export const AA_RANGE_PX = 6;

export function buildGlyphField(input: SdfRequest): GlyphField {
  const t0 = now();
  const { alpha, width, height, supersample, fontSizeDevice } = input;

  const signedSuper = computeSignedDistanceField(alpha, width, height);
  const { signed, width: outW, height: outH } =
    supersample > 1
      ? downsampleSignedField(signedSuper, width, height, supersample)
      : { signed: signedSuper, width, height };

  const { gx, gy } = computeGradient(signed, outW, outH);

  const fontSizeHintPx = fontSizeDevice / Math.max(supersample, 1);
  const { radius, radiusMean, radiusAreaPerim } = estimateStrokeRadius(signed, fontSizeHintPx);

  const texture = packTubeTexture(signed, gx, gy, outW, outH, radius, AA_RANGE_PX);

  return {
    texture,
    width: outW,
    height: outH,
    padDevice: Math.round(input.padDevice / Math.max(supersample, 1)),
    padCss: input.padCss,
    inkWidthCss: input.inkWidthCss,
    inkHeightCss: input.inkHeightCss,
    radiusPx: radius,
    radiusMean,
    radiusAreaPerim,
    aaRange: AA_RANGE_PX,
    buildMs: now() - t0,
  };
}

/** Thin wrapper matching the worker's message shape (adds nothing but the name). */
export function buildGlyphFieldResponse(input: SdfRequest): SdfResponse {
  const field = buildGlyphField(input);
  return {
    requestId: input.requestId,
    texture: field.texture,
    width: field.width,
    height: field.height,
    padDevice: field.padDevice,
    padCss: field.padCss,
    inkWidthCss: field.inkWidthCss,
    inkHeightCss: field.inkHeightCss,
    radiusPx: field.radiusPx,
    radiusMean: field.radiusMean,
    radiusAreaPerim: field.radiusAreaPerim,
    aaRange: field.aaRange,
    buildMs: field.buildMs,
  };
}
