import "server-only";
import sharp from "sharp";

/**
 * Did the edit actually do anything?
 *
 * Rebuild used to write `status: "complete"` the moment an image came back
 * from the model, and generate a confident past-tense label ("Text replaced")
 * to go with it. Measured on a real user edit (2026-08-13): 0.0567% of pixels
 * changed, all of them in a 7-pixel-tall seam across an element that wasn't
 * even the target — reported as a success. That is the single most damaging
 * thing this feature did, because it made a broken edit indistinguishable
 * from a working one, and a user who checks is right and the app is wrong.
 *
 * So: nothing is marked complete until it has been measured. The gate is
 * deliberately dumb and deterministic — a pixel diff, not a model's opinion —
 * because the model's opinion is exactly what failed.
 */

/** x, y, w, h in pixel space. */
export type Box = [number, number, number, number];

/**
 * Per-channel delta below which two pixels count as "the same".
 *
 * Both images have been through PNG/JPEG round-trips, so an unedited pixel is
 * rarely bit-identical. 8/255 is comfortably above that re-encode noise and
 * well below any visible change.
 */
const CHANNEL_EPSILON = 8;

/**
 * Per-channel delta that can't be explained by regeneration.
 *
 * This tier exists because a weak-but-obedient-looking model does not return
 * your pixels back — it REDRAWS the crop. A redraw that changed nothing
 * semantically still differs everywhere by small amounts, especially over
 * photographic content, so a low-threshold diff can read 20% "changed" on an
 * edit that did nothing at all. Ink appearing, disappearing or moving is a
 * large delta (a navy glyph over a pale background is ~150); resampling noise
 * is not. Gating on the strong tier is what makes the difference between
 * measuring an edit and measuring a re-encode.
 */
const STRONG_CHANNEL_DELTA = 48;

/**
 * Below this fraction of STRONGLY-changed pixels inside the target region, an
 * edit is treated as a no-op.
 *
 * Calibration, not a guess: the known-bad run changed 0.0567% of the FRAME,
 * and only as a 7px seam. A genuine text replacement rewrites a large share
 * of its own box — every glyph either appears or disappears. 0.5% of the
 * REGION sits far above seam-and-noise territory and far below any real edit.
 */
const MIN_STRONG_RATIO = 0.005;

/**
 * ...or this fraction changed at the low threshold, which catches the honest
 * exception: a broad, subtle change (a slight tint shift across a whole
 * element) that never produces a large per-pixel delta anywhere. Set high
 * enough that regeneration noise alone shouldn't reach it.
 */
const MIN_BROAD_RATIO = 0.6;

export interface ChangeReport {
  /** Fraction of pixels inside the region differing by more than CHANNEL_EPSILON. */
  changedRatio: number;
  /** Fraction of pixels inside the region differing by more than STRONG_CHANNEL_DELTA. */
  strongRatio: number;
  /** Fraction of pixels OUTSIDE the region that changed — should be ~0 for a scoped edit. */
  bleedRatio: number;
  /** Tight bbox of everything that changed, in full-frame pixel space, or null. */
  changedBox: Box | null;
  /**
   * True when the edit plausibly did something. A floor, not a proof: it
   * cannot tell a correct edit from a wrong one, only a real change from a
   * non-change. Semantic verification (did the text actually become the
   * requested string) is a separate check — see verifyTextEdit.
   */
  landed: boolean;
}

function intersects([x, y, w, h]: Box, px: number, py: number): boolean {
  return px >= x && px < x + w && py >= y && py < y + h;
}

/**
 * Compares two same-sized images and reports how much changed inside (and
 * outside) `region`. Pass `region: null` for a whole-frame edit, where the
 * whole image is the target and there is no outside.
 *
 * Both buffers are decoded to raw RGB at full resolution. These are large
 * images (the reference case is 3240x4050 = 13.1MP) but this runs once per
 * edit, inside a background task that already spends 15-40s in a model call —
 * a single sequential pass is not the bottleneck, and downsampling first
 * would risk averaging away exactly the thin-seam artefact this exists to
 * catch.
 */
export async function measureChange(
  beforeBytes: Buffer,
  afterBytes: Buffer,
  region: Box | null,
): Promise<ChangeReport> {
  const [before, after] = await Promise.all([
    sharp(beforeBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(afterBytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  if (before.info.width !== after.info.width || before.info.height !== after.info.height) {
    throw new Error(
      `Cannot compare images of different sizes (${before.info.width}x${before.info.height} vs ${after.info.width}x${after.info.height}). The edit changed the frame's dimensions, which it must never do.`,
    );
  }

  const { width, height, channels } = before.info;
  const target: Box = region ?? [0, 0, width, height];

  let insideChanged = 0;
  let insideStrong = 0;
  let outsideChanged = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const d = Math.max(
        Math.abs(before.data[i] - after.data[i]),
        Math.abs(before.data[i + 1] - after.data[i + 1]),
        Math.abs(before.data[i + 2] - after.data[i + 2]),
      );
      if (d <= CHANNEL_EPSILON) continue;

      if (intersects(target, x, y)) {
        insideChanged++;
        if (d > STRONG_CHANNEL_DELTA) insideStrong++;
      } else {
        outsideChanged++;
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const insideTotal = Math.max(1, target[2] * target[3]);
  const outsideTotal = Math.max(1, width * height - insideTotal);
  const changedRatio = insideChanged / insideTotal;
  const strongRatio = insideStrong / insideTotal;

  return {
    changedRatio,
    strongRatio,
    bleedRatio: outsideChanged / outsideTotal,
    changedBox: maxX < 0 ? null : [minX, minY, maxX - minX + 1, maxY - minY + 1],
    landed: strongRatio >= MIN_STRONG_RATIO || changedRatio >= MIN_BROAD_RATIO,
  };
}

/**
 * The message a user should see when an edit didn't land. Written to be
 * actionable and to admit what happened — never "something went wrong".
 */
export function describeNoOp(report: ChangeReport, region: Box | null): string {
  const pct = (report.strongRatio * 100).toFixed(3);
  const scope = region ? "the part you selected" : "the image";

  if (report.bleedRatio > report.strongRatio && report.changedBox) {
    return `The model didn't change ${scope} — it altered ${pct}% of it and touched pixels elsewhere instead. Try selecting the element again, or describe the change in fewer words.`;
  }
  return `The model returned ${scope} essentially unchanged (${pct}% of it actually differs). Try rephrasing as a direct command, e.g. 'replace the text with X'.`;
}

export { MIN_STRONG_RATIO, MIN_BROAD_RATIO, STRONG_CHANNEL_DELTA };
