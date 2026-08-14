import "server-only";
import sharp from "sharp";
import { readTextStyle, type TextLine } from "./read";
import { matchFont } from "./match";
import { renderText, fitTracking, measureWidth, type SizeMetric } from "./render";
import { buildInkMask, inpaint } from "./erase";
import { allChoices, type FontChoice } from "../fonts/catalog";

/**
 * Replaces a string of text inside a region of a design — deterministically,
 * at full resolution, with no image model involved.
 *
 * The sequence is: measure how the existing text is set, identify the closest
 * shippable typeface by metric comparison, erase the old glyphs by
 * reconstructing the background behind them, then draw the replacement on the
 * same baseline at the same cap height, colour and overall width.
 *
 * Every step is measurable and repeatable, which is the entire argument for
 * doing it this way. A generative round-trip has to redraw the whole region
 * to change one word — so it resamples the untouched parts, invents
 * letterforms, and returns ~1MP regardless of what went in. Here the only
 * pixels that change are the ones the old and new glyphs occupy, and a
 * 3240x4050 poster stays 3240x4050.
 */

export interface TextEditResult {
  /** The region, edited. Same dimensions as the input. */
  bytes: Buffer;
  /** The face used — surfaced to the user, never presented as an exact match. */
  font: FontChoice;
  /** Fractional width error of the identified face against the original. */
  fontWidthError: number;
  /** Tracking applied to fit the original width, in em. Null when it wasn't viable. */
  tracking: number | null;
  /** How much of the region was reconstructed by inpainting. */
  filledRatio: number;
}

/** How far to grow the ink mask, as a fraction of cap height. */
const DILATE_RATIO = 0.035;
/** Beyond this much tracking the line reads as stretched, so width matching is abandoned. */
const MAX_TRACKING_EM = 0.1;

/**
 * Which vertical measurement a line's observed ink height represents, given
 * the string that produced it.
 *
 * readTextStyle can only measure "top of the tallest ink down to the
 * baseline". What that height MEANS depends on the letters present, and the
 * image can't say — a line of all-caps and a line of short lowercase look
 * identical to a row-profile scan. The instruction supplies the string, so
 * this is decided from the characters rather than guessed from pixels.
 *
 * Getting it wrong is not subtle. Measured on Arimo: treating the x-height of
 * "soon" as a cap height renders the replacement at 79% of the size it should
 * be — a fifth too small, on a line sitting next to text at the correct size.
 *
 * Capitals, digits and the ascending lowercase letters all reach cap height
 * or just above it (an ascender typically overshoots the cap line by a couple
 * of percent, which is inside the tolerance everything downstream works to).
 */
function sizeMetricFor(text: string): SizeMetric {
  return /[A-Z0-9bdfhklt]/.test(text) ? "cap" : "xHeight";
}

/**
 * Picks the line that actually contains the string being replaced.
 *
 * The obvious heuristic — "edit the biggest line" — is wrong, and wrong in a
 * way that quietly destroys the design. Measured on a two-line block reading
 * "STARTING / SOON": asking to change "SOON" rewrote "STARTING", because that
 * line was wider. The user gets an edit they didn't ask for, applied to text
 * they didn't name.
 *
 * Instead: set `fromText` at each line's measured cap height and see whose
 * observed ink width it explains. The right line is the one where the string
 * actually fits — "SOON" typeset at the headline's cap height is nowhere near
 * the headline's width, and the mismatch is enormous rather than marginal.
 * Trying every catalogue face and keeping each line's best score keeps the
 * decision independent of which typeface is eventually chosen.
 */
function pickLine(lines: TextLine[], fromText: string, metric: SizeMetric): TextLine {
  const wanted = fromText.replace(/\s+/g, "").length;

  const scored = lines.map((line) => {
    // Width, minimised over the catalogue, since the real face is unknown.
    let widthErr = Infinity;
    for (const font of allChoices({ isUppercase: line.isUppercase })) {
      try {
        const w = measureWidth({ text: fromText, font, sizePx: line.inkHeightPx, metric });
        widthErr = Math.min(widthErr, Math.abs(w - line.box[2]) / Math.max(1, line.box[2]));
      } catch {
        // A face that can't set this string tells us nothing about this line.
      }
    }
    // Glyph count, which no choice of typeface can change. Generous, because
    // the count is approximate: touching letters undercount.
    const countErr = Math.abs(line.glyphCount - wanted) / Math.max(1, wanted);
    return { line, widthErr, countErr, score: widthErr + countErr * 2 };
  });

  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];

  // A count that is wildly off means the string is not on any of these lines.
  // Declining beats rewriting whichever line happened to score least badly —
  // width alone would accept a twenty-character string as an eight-letter
  // headline, because a condensed face can set it in the same space.
  if (best.countErr > 0.5) {
    throw new Error(
      `Couldn't find "${fromText}" in the selected area — its text doesn't have that many characters. Select the element that contains it.`,
    );
  }
  return best.line;
}

/** The horizontal extent of actual ink in a rendered, transparent-background bitmap. */
async function measureInkWidth(rendered: Buffer): Promise<number> {
  const { data, info } = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  let min = W;
  let max = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * channels + 3] < 8) continue;
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  return max < min ? 0 : max - min + 1;
}

/**
 * Composites `patch` onto `base` at a position that may be NEGATIVE, by
 * cropping the patch rather than clamping the position.
 *
 * sharp's composite rejects negative offsets, and the obvious workaround —
 * `Math.max(0, top)` — silently moves the content instead of clipping it.
 * That is not a cosmetic difference: the rendered bitmap carries padding
 * above its cap line, so a line of text near the top of its region legitimately
 * wants a negative offset, and clamping pushed the replacement 27px below the
 * baseline it was supposed to sit on. Measured on the reference poster.
 */
async function compositeClipped(base: Buffer, patch: Buffer, left: number, top: number): Promise<Buffer> {
  const meta = await sharp(patch).metadata();
  const pw = meta.width ?? 0;
  const ph = meta.height ?? 0;

  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  const baseMeta = await sharp(base).metadata();
  const bw = baseMeta.width ?? 0;
  const bh = baseMeta.height ?? 0;

  const width = Math.min(pw - cropLeft, bw - Math.max(0, left));
  const height = Math.min(ph - cropTop, bh - Math.max(0, top));
  if (width <= 0 || height <= 0) return base;

  const visible =
    cropLeft || cropTop || width !== pw || height !== ph
      ? await sharp(patch).extract({ left: cropLeft, top: cropTop, width, height }).png().toBuffer()
      : patch;

  return sharp(base)
    .composite([{ input: visible, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();
}

export async function applyTextEdit(params: {
  /** The region's pixels — a crop of the design around the text. */
  regionBytes: Buffer;
  /** The string being replaced, exactly as it appears. */
  fromText: string;
  /** What it should say instead. */
  toText: string;
}): Promise<TextEditResult> {
  const { regionBytes, fromText, toText } = params;

  const style = await readTextStyle(regionBytes);
  const metric = sizeMetricFor(fromText);
  const line = pickLine(style.lines, fromText, metric);

  const matches = await matchFont({ text: fromText, regionBytes, style, line, metric });
  const best = matches[0];
  if (!best) throw new Error("Could not find a typeface close enough to substitute.");

  // ── Erase ──
  // Restricted to the rows this line occupies, so a multi-line block doesn't
  // lose its other lines.
  const { mask } = await buildInkMask({
    regionBytes,
    ink: style.color,
    background: style.background,
    dilate: Math.max(1, Math.round(line.inkHeightPx * DILATE_RATIO)),
    rows: [line.box[1], line.box[1] + line.box[3] - 1],
  });
  const erased = await inpaint(regionBytes, mask);

  // ── Render the replacement ──
  // Matching the original's width keeps the line's relationship to everything
  // around it — centring, margins, the block it sits in — and it means the new
  // glyphs cover most of what was just erased.
  let tracking = fitTracking({
    text: toText,
    font: best.choice,
    sizePx: line.inkHeightPx, metric,
    targetWidth: line.box[2],
  });

  const render = (letterSpacingEm: number) =>
    renderText({
      text: toText,
      font: best.choice,
      sizePx: line.inkHeightPx, metric,
      color: style.color,
      letterSpacingEm,
    });

  let rendered = await render(tracking ?? 0);

  if (tracking !== null) {
    // fitTracking solves against ADVANCE width, but what was measured off the
    // image is INK width — advance additionally includes the first glyph's
    // left sidebearing, the last glyph's right sidebearing, and the trailing
    // letter-space. Uncorrected, the line lands ~3% narrow. One measured
    // correction pass closes it for the price of a second render.
    const inkWidth = await measureInkWidth(rendered.bytes);
    const pxPerEm =
      measureWidth({ text: toText, font: best.choice, sizePx: line.inkHeightPx, metric, letterSpacingEm: 1 }) -
      measureWidth({ text: toText, font: best.choice, sizePx: line.inkHeightPx, metric, letterSpacingEm: 0 });

    if (inkWidth > 0 && pxPerEm > 0) {
      const corrected = tracking + (line.box[2] - inkWidth) / pxPerEm;
      if (Math.abs(corrected) <= MAX_TRACKING_EM) {
        tracking = corrected;
        rendered = await render(tracking);
      }
    }
  }

  // ── Place it ──
  // Horizontally: preserve the original's centre, so a centred line stays
  // centred and a left-aligned one that kept its width stays put.
  const originalCentre = line.box[0] + line.box[2] / 2;
  const left = Math.round(originalCentre - rendered.width / 2);

  // Vertically: align BASELINES, not boxes. Two strings with different
  // ascenders and descenders have different bounding boxes, so matching box
  // tops would sit the replacement off the line it belongs to.
  const top = Math.round(line.baselineY - rendered.baselineY);

  const bytes = await compositeClipped(erased.bytes, rendered.bytes, left, top);

  return {
    bytes,
    font: best.choice,
    fontWidthError: best.widthError,
    tracking,
    filledRatio: erased.filledRatio,
  };
}
