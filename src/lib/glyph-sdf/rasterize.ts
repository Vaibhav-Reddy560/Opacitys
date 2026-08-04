/**
 * Glyph rasterization for the glass wordmark. DOM-only (canvas + font APIs);
 * pairs with the DOM-free `distance-transform.ts`. Produces a supersampled
 * alpha bitmap ready for `buildGlyphField()`.
 *
 * Three font-readiness traps this guards against (see the plan for why):
 *  1. `document.fonts.ready` can resolve before the wordmark font is ever
 *     requested, if nothing using it has painted yet.
 *  2. `document.fonts.check()` can report true off next/font's *fallback*
 *     family in its comma-joined list, not the real one.
 *  3. `check()` can still lie outright — verified independently below by
 *     diffing measured text width against a `monospace` control.
 */

import type { RasterResult } from "./types";

export interface RasterizeArgs {
  text: string;
  /** getComputedStyle(host).fontFamily — the full next/font list, unresolved. */
  computedFontFamily: string;
  /** getComputedStyle(host).fontWeight. */
  computedFontWeight: string;
  fontSizeCss: number;
  /** getComputedStyle(host).letterSpacing — "normal" or e.g. "10.5px". */
  letterSpacingCss: string;
  /** Final device-pixels-per-CSS-pixel to rasterize at (dpr * supersample), decided by the caller against MAX_TEXTURE_SIZE. */
  scale: number;
  /** 1 or 2 — informs downstream downsampling; the scale already has this folded in. */
  supersample: 1 | 2;
  padCssMin?: number;
}

export interface RasterizeResult extends RasterResult {
  fontVerified: boolean;
  resolvedFamily: string;
}

/** `"__Nemesis_abc123, __Nemesis_Fallback_abc123"` -> `Nemesis` (unquoted first token). */
export function firstFontFamily(cssFontFamilyList: string): string {
  const first = cssFontFamilyList.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "");
}

/** "10.5px" -> 10.5; "normal" / "" / garbage -> 0. */
export function parseTrackingPx(letterSpacingCss: string): number {
  if (!letterSpacingCss || letterSpacingCss === "normal") return 0;
  const n = parseFloat(letterSpacingCss);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ground-truth font-load check: measure a mixed-width probe string against
 * `family, monospace` and against `monospace` alone. If the family actually
 * resolved, the two widths differ (real metrics vs. monospace's). If it
 * silently fell through to the fallback, they are bit-identical — this is
 * what makes `document.fonts.check()`'s false positives visible.
 */
export function verifyFontByWidthDiff(family: string, weightSpec: string): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const probe = "OPACITYSMWil0O";
  ctx.font = `${weightSpec} 100px "${family}", monospace`;
  const withFamily = ctx.measureText(probe).width;
  ctx.font = `${weightSpec} 100px monospace`;
  const monospaceOnly = ctx.measureText(probe).width;
  return Math.abs(withFamily - monospaceOnly) > 0.5;
}

/**
 * Best-effort font readiness: check -> load -> verify. Returns false (never
 * throws) on any failure so the caller can fall back to `<Wordmark>` cleanly
 * rather than ship a glass render of whatever generic fallback resolved.
 */
export async function ensureFontReady(family: string, weightSpec: string): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) return false;
  try {
    const spec = `${weightSpec} 100px "${family}"`;
    if (!document.fonts.check(spec)) {
      await document.fonts.load(spec);
    }
  } catch {
    // Fall through to the width-diff check regardless — it's the real signal.
  }
  return verifyFontByWidthDiff(family, weightSpec);
}

/**
 * Runtime feature detection, not a type-level one: `letterSpacing` is
 * typed on `CanvasRenderingContext2D` regardless of engine (TS's DOM lib
 * ships it unconditionally), but Safari <17.4 and Firefox <122 don't
 * implement it — the "in" check still reflects the real prototype there.
 */
function hasLetterSpacingSupport(ctx: CanvasRenderingContext2D): boolean {
  return "letterSpacing" in ctx;
}

interface InkBox {
  left: number;
  right: number;
  ascent: number;
  descent: number;
  /** Total advance width, tracking included — how wide to make the canvas. */
  advance: number;
}

/**
 * Ink extents for `text` at the given tracking. Two paths:
 *  - native `ctx.letterSpacing` (Chrome 99+/Safari 17.4+/Firefox 122+): one
 *    `measureText` call, tracking already folded into every metric.
 *  - manual fallback: accumulate per-glyph advances (tracking applied
 *    between glyphs, not before the first or after the last — matching CSS
 *    letter-spacing semantics), taking ink left/right from the first/last
 *    glyph's own bbox offset by its drawn position, and the max ascent/
 *    descent across all glyphs (tracking is purely horizontal).
 */
function measureInkBox(ctx: CanvasRenderingContext2D, text: string, trackingDevice: number): InkBox {
  if (hasLetterSpacingSupport(ctx)) {
    ctx.letterSpacing = `${trackingDevice}px`;
    const m = ctx.measureText(text);
    return {
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
      advance: m.width,
    };
  }

  const chars = Array.from(text);
  let x = 0;
  let left = 0;
  let right = 0;
  let ascent = 0;
  let descent = 0;
  chars.forEach((ch, i) => {
    const m = ctx.measureText(ch);
    if (i === 0) left = m.actualBoundingBoxLeft;
    ascent = Math.max(ascent, m.actualBoundingBoxAscent);
    descent = Math.max(descent, m.actualBoundingBoxDescent);
    const advance = m.width;
    if (i === chars.length - 1) {
      right = x + m.actualBoundingBoxRight;
    }
    x += advance + trackingDevice;
  });
  const totalAdvance = Math.max(0, x - trackingDevice); // no trailing tracking after the last glyph
  return { left, right, ascent, descent, advance: totalAdvance };
}

function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  text: string,
  originX: number,
  originY: number,
  trackingDevice: number,
): void {
  if (hasLetterSpacingSupport(ctx)) {
    ctx.letterSpacing = `${trackingDevice}px`;
    ctx.fillText(text, originX, originY);
    return;
  }
  let x = originX;
  for (const ch of Array.from(text)) {
    ctx.fillText(ch, x, originY);
    x += ctx.measureText(ch).width + trackingDevice;
  }
}

export async function rasterizeWordmark(args: RasterizeArgs): Promise<RasterizeResult> {
  const family = firstFontFamily(args.computedFontFamily);
  const weightSpec = args.computedFontWeight || "400";
  const fontVerified = await ensureFontReady(family, weightSpec);
  const resolvedFamily = fontVerified ? family : "sans-serif";

  const { scale, supersample } = args;
  const fontSizeDevice = args.fontSizeCss * scale;
  const trackingDevice = parseTrackingPx(args.letterSpacingCss) * scale;

  const padCss = Math.max(args.padCssMin ?? 24, args.fontSizeCss * 0.22);
  const padDevice = Math.round(padCss * scale);

  // Measure pass — throwaway canvas, font applied but not yet sized to fit.
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) throw new Error("2D canvas context unavailable");
  mctx.font = `${weightSpec} ${fontSizeDevice}px "${resolvedFamily}"`;
  mctx.textBaseline = "alphabetic";
  mctx.textAlign = "left";

  const ink = measureInkBox(mctx, args.text, trackingDevice);
  const inkWidthDevice = ink.left + ink.right;
  const inkHeightDevice = ink.ascent + ink.descent;

  const width = Math.max(1, Math.ceil(inkWidthDevice + padDevice * 2));
  const height = Math.max(1, Math.ceil(inkHeightDevice + padDevice * 2));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.font = `${weightSpec} ${fontSizeDevice}px "${resolvedFamily}"`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";

  // Draw so the ink's top-left sits at (padDevice, padDevice).
  const originX = padDevice + ink.left;
  const originY = padDevice + ink.ascent;
  drawGlyphs(ctx, args.text, originX, originY, trackingDevice);

  const alpha = new Uint8ClampedArray(width * height);
  const imageData = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    alpha[i] = imageData[p + 3]; // alpha channel only — fillStyle is flat white
  }

  return {
    alpha,
    width,
    height,
    padDevice,
    padCss,
    inkWidthCss: inkWidthDevice / scale,
    inkHeightCss: inkHeightDevice / scale,
    fontSizeDevice,
    supersample,
    fontVerified,
    resolvedFamily,
  };
}
