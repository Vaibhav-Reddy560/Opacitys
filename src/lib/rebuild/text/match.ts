import "server-only";
import sharp from "sharp";
import { allChoices, type FontChoice } from "../fonts/catalog";
import { measureWidth, renderText, type SizeMetric } from "./render";
import { buildInkMask } from "./erase";
import type { TextLine, TextStyle } from "./read";

/**
 * Works out which of the catalogue's faces the original text was set in, by
 * measurement rather than by asking a model.
 *
 * Two independent signals, because either alone is fooled:
 *
 *  1. WIDTH. How much room a KNOWN string takes at a KNOWN cap height is a
 *     strong fingerprint — it encodes proportion, set width and sidebearings
 *     at once. Both quantities are observable here: the user's instruction
 *     supplies the original string, and readTextStyle measures the cap height
 *     and ink extent off the image.
 *
 *  2. SHAPE. Width alone cannot tell a serif from a grotesque, and it
 *     demonstrably doesn't: on the reference poster — bold sans over a photo —
 *     width matching ranked Tinos Bold (a Times clone) top, and the rendered
 *     substitution came out in a serif sitting directly above the design's own
 *     sans. So the candidate's rendering of the SAME string is rasterised and
 *     overlaid on the actual ink, normalised to a common box, and scored by
 *     intersection-over-union. That is a direct template match against the
 *     letterforms themselves.
 *
 * Neither can name the real typeface — it can only name the closest thing
 * that can legally be shipped — but between them they measure the two
 * properties that decide whether a substitution sits right.
 */

export interface FontMatch {
  choice: FontChoice;
  /** Rendered width of the original string at the measured cap height. */
  width: number;
  /** Fractional width error against the observed ink. Lower is better. */
  widthError: number;
  /** 1 - IoU of the rendered letterforms against the observed ones. Lower is better. */
  shapeError: number;
  /** Combined score; lower is better. */
  score: number;
}

/** How many width-ranked candidates get rasterised for the shape check. */
const RASTER_CANDIDATES = 8;

/** Both masks are scaled to this before overlap is measured, so shape is compared independently of width. */
const NORM_W = 480;
const NORM_H = 96;

/**
 * Shape carries more weight than width. Width is easy to match by accident —
 * several unrelated faces sit within a percent or two at a given cap height —
 * whereas a serif and a grotesque cannot overlap well however they are
 * scaled.
 */
const WIDTH_WEIGHT = 0.6;
const SHAPE_WEIGHT = 1.4;

/** Scales a binary mask into the normalised comparison box. */
async function normalizeMask(mask: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < mask.length; i++) buf[i] = mask[i] ? 255 : 0;
  const resized = await sharp(buf, { raw: { width: w, height: h, channels: 1 } })
    .resize(NORM_W, NORM_H, { fit: "fill" })
    .raw()
    .toBuffer();
  const out = new Uint8Array(NORM_W * NORM_H);
  for (let i = 0; i < out.length; i++) out[i] = resized[i] > 127 ? 1 : 0;
  return out;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x || y) union++;
    if (x && y) inter++;
  }
  return union === 0 ? 0 : inter / union;
}

export async function matchFont(params: {
  /** The original string, exactly as it appears in the design. */
  text: string;
  /** The region the text was measured in. */
  regionBytes: Buffer;
  style: TextStyle;
  line: TextLine;
  /** What line.inkHeightPx measures for this string. See SizeMetric. */
  metric: SizeMetric;
}): Promise<FontMatch[]> {
  const { text, regionBytes, style, line, metric } = params;
  const observedWidth = line.box[2];
  const candidates = allChoices({ isUppercase: line.isUppercase });

  // The observed letterforms, as a binary template. No dilation — this is a
  // shape comparison, and growing the mask would blur exactly the distinction
  // being measured.
  const { mask, width: maskW } = await buildInkMask({
    regionBytes,
    ink: style.color,
    background: style.background,
    dilate: 0,
    rows: [line.box[1], line.box[1] + line.box[3] - 1],
  });
  const [lx, ly, lw, lh] = line.box;
  const observed = new Uint8Array(lw * lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      observed[y * lw + x] = mask[(ly + y) * maskW + (lx + x)];
    }
  }
  const observedNorm = await normalizeMask(observed, lw, lh);

  const byWidth = candidates
    .map((choice) => {
      let width = 0;
      try {
        width = measureWidth({ text, font: choice, sizePx: line.inkHeightPx, metric });
      } catch {
        return null;
      }
      return { choice, width, widthError: Math.abs(width - observedWidth) / Math.max(1, observedWidth) };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.widthError - b.widthError);

  // Rasterise only the plausible few — a render per family/weight pair is a
  // dozen rasterisations for no gain once the width is clearly wrong.
  const out: FontMatch[] = [];
  for (const candidate of byWidth.slice(0, RASTER_CANDIDATES)) {
    let shapeError = 1;
    try {
      const rendered = await renderText({
        text,
        font: candidate.choice,
        sizePx: line.inkHeightPx, metric,
        color: { r: 0, g: 0, b: 0 },
      });
      // The glyph coverage is exactly the alpha channel of the render.
      const { data, info } = await sharp(rendered.bytes)
        .ensureAlpha()
        .extractChannel(3)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Trim to the ink before normalising, so padding around the render
      // doesn't shift the letterforms relative to the observed template.
      let minX = info.width;
      let minY = info.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (data[y * info.width + x] < 128) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX >= minX) {
        const cw = maxX - minX + 1;
        const chh = maxY - minY + 1;
        const cropped = new Uint8Array(cw * chh);
        for (let y = 0; y < chh; y++) {
          for (let x = 0; x < cw; x++) {
            cropped[y * cw + x] = data[(minY + y) * info.width + (minX + x)] >= 128 ? 1 : 0;
          }
        }
        shapeError = 1 - iou(observedNorm, await normalizeMask(cropped, cw, chh));
      }
    } catch {
      // A candidate that can't render keeps its full penalty.
    }

    out.push({
      ...candidate,
      shapeError,
      score: candidate.widthError * WIDTH_WEIGHT + shapeError * SHAPE_WEIGHT,
    });
  }

  return out.sort((a, b) => a.score - b.score);
}
