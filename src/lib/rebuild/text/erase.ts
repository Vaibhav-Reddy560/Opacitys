import "server-only";
import sharp from "sharp";

/**
 * Removes text from an image by reconstructing the background behind it —
 * locally, at full resolution, with no model and no credits.
 *
 * ── Why this doesn't need a diffusion model ──
 *
 * "Erase the old text" sounds like an inpainting job for a generative model,
 * and the obvious candidate (Cloudflare's SD 1.5 inpainting, on the free
 * daily allowance) is 512-native. Running a 1717px-wide headline region
 * through it means upscaling the result ~3.4x, which puts visible blur
 * exactly where the eye is already looking.
 *
 * It is also solving a harder problem than the one we have. The replacement
 * string is fitted to the ORIGINAL string's width (see fitTracking), so the
 * new glyphs cover most of where the old ones were. What has to be
 * reconstructed is not a headline-sized hole — it is the thin slivers where
 * two sets of letterforms occupying the same box don't overlap. Over those
 * distances a background is locally smooth even when it's photographic, and
 * diffusion-based filling is both sufficient and exact at native resolution.
 *
 * ── The algorithm ──
 *
 * Push-pull (pyramid) interpolation. Colour is averaged down a mipmap
 * pyramid weighted by how much of each pixel is known, then pushed back up,
 * with known pixels overriding at every level. A hole is filled from
 * whatever scale actually has information about it: a one-pixel gap resolves
 * from its immediate neighbours, a wide gap from a coarse level that spans
 * it. It is O(n) over the pyramid rather than thousands of relaxation
 * sweeps, which matters when the region is megapixels.
 */

export interface EraseResult {
  /** RGB bytes, same dimensions as the input. */
  bytes: Buffer;
  /** Fraction of the region that was reconstructed. */
  filledRatio: number;
}

interface Level {
  w: number;
  h: number;
  /**
   * Plain colour values in 0..255, 3 channels interleaved — NOT premultiplied
   * by weight. Keeping colour and coverage independent at every level is what
   * makes the reduction below safe: an earlier version accumulated
   * premultiplied sums while clamping coverage to 1, so a fully-known coarse
   * pixel read four times too bright, saturated, and filled every erased
   * glyph with white instead of the background behind it.
   */
  rgb: Float32Array;
  /** Coverage in 0..1: 1 = fully known, 0 = entirely hole. */
  weight: Float32Array;
}

/** Coverage below this is treated as "no real information at this level". */
const EPSILON = 1e-4;

function buildBase(rgb: Buffer, mask: Uint8Array, w: number, h: number, channels: number): Level {
  const out = new Float32Array(w * h * 3);
  const weight = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const known = mask[p] === 0 ? 1 : 0;
    weight[p] = known;
    const i = p * channels;
    // Hole pixels keep their original colour in the array but zero weight;
    // nothing reads them, and carrying the value costs nothing.
    out[p * 3] = rgb[i];
    out[p * 3 + 1] = rgb[i + 1];
    out[p * 3 + 2] = rgb[i + 2];
  }
  return { w, h, rgb: out, weight };
}

/** One 2x2 box reduction: coverage-weighted mean colour, mean coverage. */
function down(level: Level): Level {
  const w = Math.max(1, level.w >> 1);
  const h = Math.max(1, level.h >> 1);
  const rgb = new Float32Array(w * h * 3);
  const weight = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      let cells = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = y * 2 + dy;
        if (sy >= level.h) continue;
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          if (sx >= level.w) continue;
          const sp = sy * level.w + sx;
          const cw = level.weight[sp];
          cells++;
          if (cw < EPSILON) continue;
          r += level.rgb[sp * 3] * cw;
          g += level.rgb[sp * 3 + 1] * cw;
          b += level.rgb[sp * 3 + 2] * cw;
          wsum += cw;
        }
      }
      const p = y * w + x;
      if (wsum >= EPSILON) {
        rgb[p * 3] = r / wsum;
        rgb[p * 3 + 1] = g / wsum;
        rgb[p * 3 + 2] = b / wsum;
      }
      // Coverage is the FRACTION of contributing cells that were known, so it
      // stays in 0..1 by construction rather than by clamping.
      weight[p] = cells > 0 ? wsum / cells : 0;
    }
  }
  return { w, h, rgb, weight };
}

/**
 * Pushes a coarse level back into a finer one, filling only where the finer
 * level lacks coverage. Bilinear sampling of the coarse level keeps the fill
 * smooth instead of blocky.
 */
function up(fine: Level, coarse: Level): void {
  const sample = (cx: number, cy: number): [number, number, number, number] => {
    const x = Math.max(0, Math.min(coarse.w - 1, cx));
    const y = Math.max(0, Math.min(coarse.h - 1, cy));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(coarse.w - 1, x0 + 1);
    const y1 = Math.min(coarse.h - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;

    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    const corners: Array<[number, number, number]> = [
      [x0, y0, (1 - fx) * (1 - fy)],
      [x1, y0, fx * (1 - fy)],
      [x0, y1, (1 - fx) * fy],
      [x1, y1, fx * fy],
    ];
    for (const [px, py, k] of corners) {
      const p = py * coarse.w + px;
      const cw = coarse.weight[p];
      if (cw < EPSILON) continue;
      // Colour is already unpremultiplied; weight it by bilinear share AND
      // by how much the coarse pixel actually knows.
      r += coarse.rgb[p * 3] * k * cw;
      g += coarse.rgb[p * 3 + 1] * k * cw;
      b += coarse.rgb[p * 3 + 2] * k * cw;
      wsum += k * cw;
    }
    return wsum < EPSILON ? [0, 0, 0, 0] : [r / wsum, g / wsum, b / wsum, wsum];
  };

  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const p = y * fine.w + x;
      if (fine.weight[p] >= 1 - EPSILON) continue;

      const [r, g, b, cw] = sample((x - 0.5) / 2, (y - 0.5) / 2);
      if (cw < EPSILON) continue;

      const own = fine.weight[p];
      // Blend what this level already knows with the coarse estimate, in
      // proportion to confidence. A fully-unknown pixel takes the coarse
      // colour outright; a partially-known one keeps most of its own.
      const fill = 1 - own;
      fine.rgb[p * 3] = fine.rgb[p * 3] * own + r * fill;
      fine.rgb[p * 3 + 1] = fine.rgb[p * 3 + 1] * own + g * fill;
      fine.rgb[p * 3 + 2] = fine.rgb[p * 3 + 2] * own + b * fill;
      fine.weight[p] = 1;
    }
  }
}

/**
 * Reconstructs every pixel where `mask` is non-zero from the surrounding
 * image. `mask` is one byte per pixel, row-major, matching the region.
 */
export async function inpaint(regionBytes: Buffer, mask: Uint8Array): Promise<EraseResult> {
  const { data, info } = await sharp(regionBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  if (mask.length !== W * H) {
    throw new Error(`Mask is ${mask.length} px but the region is ${W * H} px.`);
  }

  let holes = 0;
  for (let p = 0; p < W * H; p++) if (mask[p] !== 0) holes++;
  if (holes === 0) {
    return { bytes: Buffer.from(data), filledRatio: 0 };
  }

  const levels: Level[] = [buildBase(data, mask, W, H, channels)];
  while (levels[levels.length - 1].w > 1 && levels[levels.length - 1].h > 1) {
    levels.push(down(levels[levels.length - 1]));
  }
  for (let i = levels.length - 1; i > 0; i--) {
    up(levels[i - 1], levels[i]);
  }

  const base = levels[0];
  const out = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    // rgb is a plain colour at every level, so this is a read, not a divide.
    out[p * 3] = Math.max(0, Math.min(255, Math.round(base.rgb[p * 3])));
    out[p * 3 + 1] = Math.max(0, Math.min(255, Math.round(base.rgb[p * 3 + 1])));
    out[p * 3 + 2] = Math.max(0, Math.min(255, Math.round(base.rgb[p * 3 + 2])));
  }

  const bytes = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return { bytes, filledRatio: holes / (W * H) };
}

/**
 * Builds the hole mask for a piece of text: every ink pixel, grown by
 * `dilate` pixels.
 *
 * The dilation is what stops a faint halo of the old colour surviving around
 * the erased glyphs. Anti-aliased edges are a gradient between ink and
 * background, so a mask drawn at the ink threshold leaves the outer half of
 * that gradient behind — visible as a ghost outline of the original word,
 * which is precisely the artefact this whole path exists to avoid.
 */
export async function buildInkMask(params: {
  regionBytes: Buffer;
  /** Ink colour to key against, as measured by readTextStyle. */
  ink: { r: number; g: number; b: number };
  background: { r: number; g: number; b: number };
  /** Pixels to grow the mask by. Scales with cap height at the call site. */
  dilate: number;
  /** Restrict to these rows, so a mask for one line doesn't erase its neighbours. */
  rows?: [number, number];
}): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const { regionBytes, ink, background, dilate, rows } = params;
  const { data, info } = await sharp(regionBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;

  const mask = new Uint8Array(W * H);

  // Project each pixel onto the background->ink axis and keep the ones past
  // the midpoint, rather than keeping everything within some RADIUS of the
  // ink colour.
  //
  // The radius version is the intuitive one and it is badly wrong over
  // photographs. Measured on the reference poster — navy text on a photo of a
  // glass tower — a radius of half the ink/background distance also swallowed
  // every mid-blue in the building, masking 31% of the region. The inpainter
  // then dutifully reconstructed all of it from the few pale pixels left,
  // producing a washed-out band across the image.
  //
  // Projection separates the two things that vary here: position ALONG the
  // axis is "how inky is this pixel", which is what we want, while distance
  // PERPENDICULAR to it is hue variation in the background, which we must
  // ignore. A photo's texture moves mostly perpendicular; a glyph's
  // anti-aliased edge moves along.
  const ax = ink.r - background.r;
  const ay = ink.g - background.g;
  const az = ink.b - background.b;
  const axisLenSq = ax * ax + ay * ay + az * az;
  if (axisLenSq < 1) {
    throw new Error("Text and background are the same colour — nothing to key against.");
  }
  // Slightly past halfway: under-masking is recoverable (dilation grows it,
  // and the new glyphs cover most of it), over-masking destroys real content.
  const CUTOFF = 0.55;

  const [rowStart, rowEnd] = rows ?? [0, H - 1];
  for (let y = rowStart; y <= rowEnd && y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const i = p * channels;
      const t =
        ((data[i] - background.r) * ax +
          (data[i + 1] - background.g) * ay +
          (data[i + 2] - background.b) * az) /
        axisLenSq;
      if (t > CUTOFF) mask[p] = 1;
    }
  }

  if (dilate > 0) {
    // Separable box dilation — two O(n*r) passes rather than one O(n*r^2).
    const tmp = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let on = 0;
        for (let k = -dilate; k <= dilate && !on; k++) {
          const sx = x + k;
          if (sx >= 0 && sx < W && mask[y * W + sx]) on = 1;
        }
        tmp[y * W + x] = on;
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let on = 0;
        for (let k = -dilate; k <= dilate && !on; k++) {
          const sy = y + k;
          if (sy >= 0 && sy < H && tmp[sy * W + x]) on = 1;
        }
        mask[y * W + x] = on;
      }
    }
  }

  return { mask, width: W, height: H };
}
