import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db, schema } from "@/lib/db";
import { generateJson, MODELS } from "@/lib/ai/models";
import { z } from "zod";
import { editImage, EDIT_MODELS, planSize, type EditModel } from "./pollinations";
import { editImageKlein, inpaintSd15, hasCloudflareCredentials } from "./cloudflare";
import { detectAndStoreLayers, readImageMeta } from "./layers";
import { normalizeInstruction, buildEditPrompt } from "./instruction";
import { measureChange, describeNoOp, type ChangeReport, type Box } from "./verify";
import { applyTextEdit } from "./text/apply";

/**
 * Applies one natural-language edit to a version's image, producing a new
 * version with its own freshly-detected layer set.
 *
 * ── WHAT CHANGED, AND WHY IT MATTERS ──
 *
 * This file used to composite the model's patch through a COLOUR KEY: pixels
 * close to a sampled background colour were forced transparent, on the theory
 * that they were "untouched background" and the original should show through.
 *
 * That made every edit additive-only. Wherever the model correctly ERASED
 * something, the patch was transparent there, so the original pixels
 * survived — the old content could never go away. Deleting an element,
 * shortening a line of text, moving or recolouring anything: all impossible
 * by construction, not by accident. The observable symptom was a poster whose
 * button read "Stay Tuned For Registration…" with a smaller "Stay Tuned for
 * Updates" ghosted underneath it, both at once, after an edit that reported
 * success. And when the returned crop was mostly flat, the key removed
 * essentially all of it and the edit changed 0.05% of the image while still
 * being written to the database as `complete`.
 *
 * The colour key is gone. Inside the selection the model's pixels are used
 * WHOLESALE, feathered only at the boundary. That is what makes removal work.
 * Outside the selection the original is untouched, which is what preserves
 * the source's real resolution (a 3240x4050 upload stays 3240x4050 rather
 * than coming back as whatever ~1MP frame the model felt like emitting).
 *
 * And nothing is marked complete until a pixel diff says something actually
 * happened — see ./verify.ts.
 */

/** How much real context to grow a selection by before cropping, so the model has surrounding style/color/font to match against. */
const CONTEXT_PAD = 0.12;
/**
 * Fixed pixels of breathing room added to the SELECTION before it becomes the
 * opaque region in the final composite — just enough that a hard mask edge
 * doesn't clip anti-aliased glyph edges. Deliberately tiny and fixed, not a
 * percentage: growing the actually-baked region with the selection size would
 * defeat the point of scoping the edit.
 */
const EDIT_PAD_PX = 6;
/** How wide a blend to feather at the composite boundary, hiding any resize/re-encode seam. */
const FEATHER_PX = 10;
/**
 * Reshaping a crop toward one of the model's fixed ratios means growing the
 * crop, which sweeps in more real design content. This caps how much: beyond
 * 4x the padded box's area, the extra content isn't worth it and the crop is
 * left alone — letterboxing (see toModelCanvas) then handles the aspect
 * mismatch without distorting anything.
 */
const MAX_GROWTH_AREA = 4;

/** Clamp a box to the frame — clamp the origin first, then fit the size to what's left, so sharp's extract() never sees an out-of-bounds rectangle. */
function clampBox([x, y, w, h]: Box, frameW: number, frameH: number): Box {
  const cx = Math.max(0, Math.min(frameW - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(frameH - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(frameW - cx, Math.round(w)));
  const ch = Math.max(1, Math.min(frameH - cy, Math.round(h)));
  return [cx, cy, cw, ch];
}

function expandForContext(box: Box, frameW: number, frameH: number): Box {
  const [x, y, w, h] = box;
  const padX = w * CONTEXT_PAD;
  const padY = h * CONTEXT_PAD;
  return clampBox([x - padX, y - padY, w + padX * 2, h + padY * 2], frameW, frameH);
}

/** Grows the shorter axis (centered, never shrinks) toward a target ratio. */
function growToRatio(box: Box, targetRatio: number, frameW: number, frameH: number): Box {
  const [x, y, w, h] = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const ratio = w / h;
  let newW = w;
  let newH = h;
  if (ratio < targetRatio) newW = h * targetRatio;
  else newH = w / targetRatio;
  return clampBox([cx - newW / 2, cy - newH / 2, newW, newH], frameW, frameH);
}

/**
 * Decides the actual crop for a scoped edit: try reshaping toward the target
 * model's best-fit ratio, but only if that doesn't sweep in disproportionately
 * more real content than the plain context-padded selection.
 *
 * Takes the target ratio directly rather than an EditModel — this geometry is
 * the same regardless of which provider ends up editing the crop; only the
 * ratio each provider's models actually want differs, and that decision
 * belongs to the caller (see planSize in ./pollinations, or ./cloudflare's
 * equivalent).
 */
function planCropBox(region: Box, frameW: number, frameH: number, targetRatio: number): Box {
  const padded = expandForContext(region, frameW, frameH);
  const grown = growToRatio(padded, targetRatio, frameW, frameH);
  const paddedArea = padded[2] * padded[3];
  const grownArea = grown[2] * grown[3];
  return grownArea <= paddedArea * MAX_GROWTH_AREA ? grown : padded;
}

/** Average color of a box's four corners — the box was context-padded specifically so its corners land on real background rather than the edited element itself. */
async function sampleBackground(imageBytes: Buffer, [x, y, w, h]: Box): Promise<{ r: number; g: number; b: number }> {
  const size = Math.max(2, Math.min(8, Math.floor(Math.min(w, h) * 0.05)));
  // Clamped on BOTH axes. Clamping only the origin (as this once did) lets
  // left+size run past the right edge on a box that touches the frame, which
  // is what sharp reports as "extract_area: bad extract area" — three real
  // runs died this way before the corners were bounded here.
  const corners: Array<[number, number]> = [
    [x, y],
    [x + w - size, y],
    [x, y + h - size],
    [x + w - size, y + h - size],
  ];
  let rs = 0;
  let gs = 0;
  let bs = 0;
  let n = 0;
  const meta = await sharp(imageBytes).metadata();
  const frameW = meta.width ?? 0;
  const frameH = meta.height ?? 0;
  for (const [cx, cy] of corners) {
    const left = Math.max(0, Math.min(frameW - size, Math.round(cx)));
    const top = Math.max(0, Math.min(frameH - size, Math.round(cy)));
    if (left < 0 || top < 0) continue;
    const { data, info } = await sharp(imageBytes)
      .extract({ left, top, width: size, height: size })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      rs += data[i];
      gs += data[i + 1];
      bs += data[i + 2];
      n++;
    }
  }
  if (!n) return { r: 128, g: 128, b: 128 };
  return { r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n) };
}

/**
 * An alpha mask, the size of the crop, opaque ONLY over `inner` (feathered at
 * its edges) and fully transparent everywhere else.
 *
 * This is the ONLY thing deciding what gets written back. It is purely
 * geometric — it knows where the selection is and nothing about what the
 * model drew. That is deliberate, and it is the fix: the previous design
 * intersected this with a colour key over the model's output, which is what
 * made erasing impossible. Within `inner` the patch now wins unconditionally.
 */
async function regionMask(canvasW: number, canvasH: number, inner: Box, feather: number): Promise<Buffer> {
  const [ix, iy, iw, ih] = clampBox(inner, canvasW, canvasH);
  const whiteRect = await sharp({
    create: { width: iw, height: ih, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: whiteRect, left: ix, top: iy }])
    .blur(Math.max(0.3, feather / 2))
    .extractChannel(0)
    .raw()
    .toBuffer();
}

interface Letterbox {
  bytes: Buffer;
  /** Where the real content sits inside the padded canvas. */
  offsetX: number;
  offsetY: number;
  canvasW: number;
  canvasH: number;
}

/**
 * Pads an image out to the model's target ASPECT before sending it.
 *
 * The models here emit only a handful of fixed sizes and snap to the nearest
 * — measured: a 1500x300 request came back 1536x1024, and even a portrait
 * 1024x1536 request came back landscape. The old code sent the crop as-is and
 * then squashed whatever came back to fit with `fit: "fill"`, which visibly
 * distorted every patch whose aspect the model wouldn't honour.
 *
 * Letterboxing instead keeps a pixel-exact correspondence: the content sits
 * at a known offset in a canvas whose aspect the model CAN produce, so the
 * response can be scaled uniformly and the same rectangle cut back out. No
 * stretching, no guessing where the content ended up. The padding is filled
 * with the sampled background so the seam doesn't invite the model to invent
 * an edge, and it is cropped away before compositing regardless.
 */
async function toModelCanvas(
  imageBytes: Buffer,
  w: number,
  h: number,
  targetRatio: number,
  bg: { r: number; g: number; b: number },
): Promise<Letterbox> {
  const canvasW = Math.max(w, Math.round(h * targetRatio));
  const canvasH = Math.max(h, Math.round(w / targetRatio));
  const offsetX = Math.floor((canvasW - w) / 2);
  const offsetY = Math.floor((canvasH - h) / 2);

  const bytes = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: bg },
  })
    .composite([{ input: imageBytes, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();

  return { bytes, offsetX, offsetY, canvasW, canvasH };
}

/**
 * Undoes toModelCanvas: scales the model's output back to the padded canvas's
 * true pixel size (a uniform scale — the aspects match by construction) and
 * cuts out the rectangle the real content occupied.
 */
async function fromModelCanvas(editedBytes: Buffer, box: Letterbox, w: number, h: number): Promise<Buffer> {
  return sharp(editedBytes)
    .resize(box.canvasW, box.canvasH, { fit: "fill" })
    .extract({ left: box.offsetX, top: box.offsetY, width: w, height: h })
    .removeAlpha()
    .toBuffer();
}

/** Describes where a box sits, in the language a person would use, for prompt scoping. */
function describeRegion(bbox: Box, imgW: number, imgH: number): string {
  const cx = (bbox[0] + bbox[2] / 2) / imgW;
  const cy = (bbox[1] + bbox[3] / 2) / imgH;
  const vertical = cy < 0.33 ? "top" : cy > 0.66 ? "bottom" : "middle";
  const horizontal = cx < 0.33 ? "left" : cx > 0.66 ? "right" : "center";
  const coversWidth = bbox[2] / imgW > 0.8;
  if (coversWidth) return `the ${vertical} band of the image`;
  return `the ${vertical}-${horizontal} area of the image`;
}

const labelSchema = z.object({ label: z.string() });

/**
 * A 2-4 word checkpoint name for the history strip ("Button text updated").
 *
 * Called only AFTER verification passes. It used to run unconditionally, so a
 * no-op edit was filed under a confident past-tense label like "Text
 * replaced" — the label asserting exactly the thing that hadn't happened.
 */
async function summarizeInstruction(instruction: string): Promise<string> {
  const fallback = instruction.trim().slice(0, 40) || "Edit";
  try {
    const { data } = await generateJson({
      model: MODELS.fast,
      schema: labelSchema,
      schemaName: "rebuild_edit_label",
      system: `Name this image edit in 2-4 words, like a version-history entry. Past tense, no quotes, no trailing period.
Examples: "Button text updated", "Background recolored", "Headline rewritten".
Return ONLY valid JSON in exactly this shape: {"label":"Button text updated"}`,
      messages: [{ role: "user", content: instruction }],
      maxOutputTokens: 60,
    });
    return data.label?.trim().slice(0, 60) || fallback;
  } catch (err) {
    console.error("[rebuild] edit label generation failed, using the instruction:", err);
    return fallback;
  }
}

/**
 * One generation attempt. Returns the full frame with the edit composited in,
 * at the source's exact dimensions.
 */
async function attemptEdit(params: {
  parentBytes: Buffer;
  parentImageUrl: string;
  userId: string;
  prompt: string;
  region: Box | null;
  frameW: number;
  frameH: number;
  model: EditModel;
  seed: number;
}): Promise<Buffer> {
  const { parentBytes, parentImageUrl, userId, prompt, region, frameW, frameH, model, seed } = params;

  if (!region) {
    // ── WHOLE-FRAME PATH ──
    // No untouched area to preserve by definition. The frame still comes back
    // at the SOURCE's dimensions: the model emits ~1MP, so this is an upscale
    // and will be softer than the original, but silently returning a
    // 6480x3240 upload as a 1024x1024 image (which this used to do) is worse
    // than soft.
    const bg = await sampleBackground(parentBytes, [0, 0, frameW, frameH]);
    const wholeTarget = planSize(model, frameW, frameH);
    const boxed = await toModelCanvas(parentBytes, frameW, frameH, wholeTarget.width / wholeTarget.height, bg);
    const url = await uploadTemp(userId, boxed.bytes);
    const edited = await editImage({
      images: [url],
      instruction: prompt,
      width: boxed.canvasW,
      height: boxed.canvasH,
      model,
      seed,
    });
    const flat = await fromModelCanvas(edited.bytes, boxed, frameW, frameH);
    return sharp(flat).png().toBuffer();
  }

  // ── SCOPED PATH: edit a crop, composite it back onto the untouched original ──
  // planSize wants the PADDED crop's own size to decide a target ratio (it
  // reasons about how much growth reshaping costs), so this pre-computes a
  // provisional context pad — cheap, and planCropBox repeats the real one.
  const provisional = expandForContext(region, frameW, frameH);
  const cropTarget = planSize(model, provisional[2], provisional[3]);
  const cropBox = planCropBox(region, frameW, frameH, cropTarget.width / cropTarget.height);
  const [cx, cy, cw, ch] = cropBox;
  const bg = await sampleBackground(parentBytes, cropBox);

  const cropPng = await sharp(parentBytes)
    .extract({ left: cx, top: cy, width: cw, height: ch })
    .flatten({ background: bg })
    .png()
    .toBuffer();

  const scopedTarget = planSize(model, cw, ch);
  const boxed = await toModelCanvas(cropPng, cw, ch, scopedTarget.width / scopedTarget.height, bg);
  const cropUrl = await uploadTemp(userId, boxed.bytes);

  // The crop AND the full design. The full design is what makes "match the
  // typeface used elsewhere" answerable at all — editing a bare crop cannot
  // honour an instruction about the rest of the image, because the rest of
  // the image was never in the request.
  const edited = await editImage({
    images: [cropUrl, parentImageUrl],
    instruction: prompt,
    width: boxed.canvasW,
    height: boxed.canvasH,
    model,
    seed,
  });

  const patch = await fromModelCanvas(edited.bytes, boxed, cw, ch);

  // Only the true selection becomes opaque — see regionMask. No colour key.
  const innerLocal: Box = [
    region[0] - cx - EDIT_PAD_PX,
    region[1] - cy - EDIT_PAD_PX,
    region[2] + EDIT_PAD_PX * 2,
    region[3] + EDIT_PAD_PX * 2,
  ];
  const mask = await regionMask(cw, ch, innerLocal, FEATHER_PX);

  const patchRGBA = await sharp(patch)
    .joinChannel(mask, { raw: { width: cw, height: ch, channels: 1 } })
    .png()
    .toBuffer();

  return sharp(parentBytes)
    .ensureAlpha()
    .composite([{ input: patchRGBA, left: cx, top: cy }])
    .png()
    .toBuffer();
}

/**
 * A generative attempt via Cloudflare Workers AI — see ./cloudflare.ts for
 * the two models' genuinely different contracts.
 *
 * "klein" shares the exact crop/letterbox/feathered-composite architecture
 * `attemptEdit` uses for Pollinations, because it needs to: it has no real
 * mask support either (see cloudflare.ts's doc comment — confirmed live, a
 * "mask" field is silently accepted and ignored). It always emits a fixed
 * 1024x1024 square, so its target ratio is always 1:1 — simpler than
 * Pollinations' 3-ratio matching, not a special case of it.
 *
 * "sd15" is architecturally different because it actually has a mask worth
 * using: the request carries this app's own regionMask() directly, and the
 * model composites internally, so the response needs no further masked
 * blending on this side. A light feathered blend is still applied on top,
 * purely to hide any resize/encode seam at the boundary, not to do the real
 * masking work.
 *
 * Both share a limitation that predates this file's Cloudflare support:
 * regionMask() is a plain rectangle sized to the selection's bounding box,
 * with no idea of the selected element's actual silhouette. Measured live —
 * asking to recolour a star-shaped badge solid navy — the edit correctly
 * produced flat navy with no hallucinated text (klein) or the wrong colour
 * outright (sd15 returned solid black), but composited as a visibly
 * rectangular patch, not the badge's real outline. That is a property of
 * regionMask() shared identically by the pre-existing Pollinations path
 * (attemptEdit, above) — genuine shape-aware masking would need real
 * segmentation, which is out of scope here.
 *
 * Exported for direct testing — see scripts/probe-cloudflare.ts.
 */
export async function attemptCloudflareEdit(params: {
  parentBytes: Buffer;
  prompt: string;
  region: Box | null;
  frameW: number;
  frameH: number;
  engine: "klein" | "sd15";
}): Promise<Buffer> {
  const { parentBytes, prompt, region, frameW, frameH, engine } = params;

  if (engine === "sd15") {
    if (!region) {
      // SD1.5-inpainting is only ever used for scoped edits here — a
      // whole-frame "mask" would just be the entire canvas, which is not a
      // meaningfully different request from klein's plain regeneration, and
      // klein already covers that case with better content quality.
      throw new Error("sd15 inpainting requires a selected region.");
    }
    const cropBox = expandForContext(region, frameW, frameH);
    const [cx, cy, cw, ch] = cropBox;
    const cropPng = await sharp(parentBytes)
      .extract({ left: cx, top: cy, width: cw, height: ch })
      .removeAlpha()
      .png()
      .toBuffer();

    const innerLocal: Box = [
      region[0] - cx - EDIT_PAD_PX,
      region[1] - cy - EDIT_PAD_PX,
      region[2] + EDIT_PAD_PX * 2,
      region[3] + EDIT_PAD_PX * 2,
    ];
    const maskRaw = await regionMask(cw, ch, innerLocal, FEATHER_PX);
    const maskPng = await sharp(maskRaw, { raw: { width: cw, height: ch, channels: 1 } }).png().toBuffer();

    const editedCrop = await inpaintSd15({ image: cropPng, mask: maskPng, instruction: prompt });
    const editedMeta = await readImageMeta(editedCrop);
    // The model is expected to honour the crop's exact size; if it doesn't,
    // resize rather than let a mismatched composite throw or silently
    // misalign — the outer dimension-contract check still catches a
    // meaningfully wrong result later.
    const fitted =
      editedMeta.width === cw && editedMeta.height === ch
        ? editedCrop
        : await sharp(editedCrop).resize(cw, ch, { fit: "fill" }).toBuffer();

    // A light feathered blend on top of the model's own masking, purely to
    // hide a resize/encode seam — not the real masking, which the model
    // already did.
    const patchRGBA = await sharp(fitted)
      .removeAlpha()
      .joinChannel(maskRaw, { raw: { width: cw, height: ch, channels: 1 } })
      .png()
      .toBuffer();
    return sharp(parentBytes)
      .ensureAlpha()
      .composite([{ input: patchRGBA, left: cx, top: cy }])
      .png()
      .toBuffer();
  }

  // ── klein: same shape as Pollinations' attemptEdit, square target ──
  if (!region) {
    const bg = await sampleBackground(parentBytes, [0, 0, frameW, frameH]);
    const boxed = await toModelCanvas(parentBytes, frameW, frameH, 1, bg);
    const edited = await editImageKlein({ image: boxed.bytes, instruction: prompt });
    const flat = await fromModelCanvas(edited.bytes, boxed, frameW, frameH);
    return sharp(flat).png().toBuffer();
  }

  const cropBox = planCropBox(region, frameW, frameH, 1);
  const [cx, cy, cw, ch] = cropBox;
  const bg = await sampleBackground(parentBytes, cropBox);
  const cropPng = await sharp(parentBytes)
    .extract({ left: cx, top: cy, width: cw, height: ch })
    .flatten({ background: bg })
    .png()
    .toBuffer();

  const boxed = await toModelCanvas(cropPng, cw, ch, 1, bg);
  const edited = await editImageKlein({ image: boxed.bytes, instruction: prompt });
  const patch = await fromModelCanvas(edited.bytes, boxed, cw, ch);

  const innerLocal: Box = [
    region[0] - cx - EDIT_PAD_PX,
    region[1] - cy - EDIT_PAD_PX,
    region[2] + EDIT_PAD_PX * 2,
    region[3] + EDIT_PAD_PX * 2,
  ];
  const mask = await regionMask(cw, ch, innerLocal, FEATHER_PX);
  const patchRGBA = await sharp(patch)
    .joinChannel(mask, { raw: { width: cw, height: ch, channels: 1 } })
    .png()
    .toBuffer();

  return sharp(parentBytes)
    .ensureAlpha()
    .composite([{ input: patchRGBA, left: cx, top: cy }])
    .png()
    .toBuffer();
}

/**
 * How much to pad a text layer's box before editing it.
 *
 * A detected bbox is drawn to the ink it found, and detection routinely
 * clips the extremes by a pixel or three — on the reference poster the layer
 * box cut through the "S" of "STARTING" and the final "G". Erasing inside
 * that box then leaves slivers of the original letters standing just outside
 * it, which read as exactly the ghosting this path exists to eliminate.
 * Padding generously costs nothing: the text path only rewrites pixels the
 * glyphs occupy, so a larger working area does not mean a larger edit.
 */
const TEXT_PAD_RATIO = 0.15;

/**
 * The deterministic text path: no image model, no credits, no resolution
 * loss. Returns null when this edit isn't one it can do, so the caller falls
 * through to the generative path rather than failing.
 */
async function attemptTextEdit(params: {
  parentBytes: Buffer;
  region: Box;
  frameW: number;
  frameH: number;
  fromText: string;
  toText: string;
}): Promise<{ bytes: Buffer; note: string } | null> {
  const { parentBytes, region, frameW, frameH, fromText, toText } = params;

  const padX = region[2] * TEXT_PAD_RATIO;
  const padY = region[3] * TEXT_PAD_RATIO;
  const [cx, cy, cw, ch] = clampBox(
    [region[0] - padX, region[1] - padY, region[2] + padX * 2, region[3] + padY * 2],
    frameW,
    frameH,
  );

  const cropPng = await sharp(parentBytes)
    .extract({ left: cx, top: cy, width: cw, height: ch })
    .png()
    .toBuffer();

  const result = await applyTextEdit({ regionBytes: cropPng, fromText, toText });

  const bytes = await sharp(parentBytes)
    .composite([{ input: result.bytes, left: cx, top: cy }])
    .png()
    .toBuffer();

  const tracking = result.tracking === null ? "none" : `${(result.tracking * 1000).toFixed(0)}/1000em`;
  return {
    bytes,
    note:
      `set in ${result.font.family.label} ${result.font.weight}` +
      (result.font.family.metricTwin ? ` (metrically ${result.font.family.metricTwin})` : "") +
      `, ${(result.fontWidthError * 100).toFixed(1)}% width match, tracking ${tracking}`,
  };
}

/** Pollinations fetches inputs by URL — there is no POST form — so a crop has to be publicly reachable before it can be edited. */
async function uploadTemp(userId: string, bytes: Buffer): Promise<string> {
  const blob = await put(`rebuild-crops/${userId}/${randomUUID()}.png`, bytes, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function runRebuildEdit(params: {
  versionId: string;
  analysisId: string;
  userId: string;
  parentImageUrl: string;
  instruction: string;
  /** The selected layer's name, when the edit was aimed at one. */
  layerName?: string | null;
  /** The selected layer's or marquee's box, in the parent image's pixel space. */
  region?: Box | null;
}): Promise<{ versionId: string }> {
  const { versionId, analysisId, userId, parentImageUrl, instruction, layerName } = params;

  await db
    .update(schema.rebuildVersions)
    .set({ status: "running", stage: "generating" })
    .where(eq(schema.rebuildVersions.id, versionId));

  try {
    const parentRes = await fetch(parentImageUrl);
    if (!parentRes.ok) {
      throw new Error(`Could not fetch the image to edit (${parentRes.status}).`);
    }
    const parentBytes = Buffer.from(await parentRes.arrayBuffer());
    const parentMeta = await readImageMeta(parentBytes);
    const frameW = parentMeta.width;
    const frameH = parentMeta.height;

    // Clamp the incoming region once, here. A marquee arrives from the client
    // as raw arithmetic on the rendered image size and can land a pixel or
    // two outside the frame; a layer bbox can too, after rounding.
    const region: Box | null = params.region ? clampBox(params.region, frameW, frameH) : null;

    const normalized = await normalizeInstruction(instruction);
    const target = region
      ? layerName
        ? `the ${layerName} (${describeRegion(region, frameW, frameH)})`
        : describeRegion(region, frameW, frameH)
      : null;
    const prompt = buildEditPrompt({
      directive: normalized.directive,
      target,
      hasContextImage: !!region,
    });

    let finalBytes: Buffer | null = null;
    let report: ChangeReport | null = null;
    let usedModel: EditModel = EDIT_MODELS[0];
    // Provenance, written alongside the version so a finished edit records
    // how it was made and what was actually verified about it.
    let method: "text" | "pollinations" | "cloudflare" = "pollinations";
    let cloudflareEngine: "klein" | "sd15" | null = null;
    let fontNote: string | null = null;
    let attempts = 0;

    // ── The deterministic text path, tried first when it applies ──
    // A text replacement is the common case in a design tool and the one a
    // generative model is worst at: it has to redraw the whole region to
    // change one word, so it resamples everything, invents letterforms, and
    // hands back ~1MP. Measuring the existing type and re-setting the line
    // from real font outlines is exact, free, and preserves the source's
    // resolution. It only runs when the instruction genuinely names both the
    // old and the new string, and any failure falls through rather than
    // failing the edit.
    if (region && normalized.kind === "text" && normalized.fromText && normalized.toText) {
      try {
        const text = await attemptTextEdit({
          parentBytes,
          region,
          frameW,
          frameH,
          fromText: normalized.fromText,
          toText: normalized.toText,
        });
        if (text) {
          const textReport = await measureChange(parentBytes, text.bytes, region);
          console.info(
            `[rebuild] text path: ${text.note} | strong=${(textReport.strongRatio * 100).toFixed(2)}% ` +
              `bleed=${(textReport.bleedRatio * 100).toFixed(4)}% landed=${textReport.landed}`,
          );
          attempts++;
          if (textReport.landed) {
            finalBytes = text.bytes;
            report = textReport;
            method = "text";
            fontNote = text.note;
          }
        }
      } catch (err) {
        // Not a failure — the region may not contain readable text, or no
        // face may be close enough. The generative path below still applies.
        console.info(
          `[rebuild] text path declined, falling back to a model: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Escalation order: Pollinations models first (best-tested quality, but
    // blocked whenever Pollen is at 0 — see ./pollinations's doc comment),
    // then Cloudflare's klein (free, renewable daily budget, and — measured
    // live on this app's own reference poster — actually follows
    // instructions where SD1.5 does not), then Cloudflare's SD1.5-inpainting
    // as a last resort for its precise mask boundary despite weaker content
    // quality. sd15 only applies to scoped edits — see attemptCloudflareEdit.
    type Candidate = EditModel | "klein" | "sd15";
    const candidates: Candidate[] = [...EDIT_MODELS];
    if (hasCloudflareCredentials()) {
      candidates.push("klein");
      if (region) candidates.push("sd15");
    }

    // A failure from one candidate must fall through to the next, not abort
    // the edit outright — a transient provider error shouldn't fail an edit
    // when another model is right there as a fallback.
    let lastError: unknown = null;
    for (let attempt = 0; finalBytes === null && attempt < candidates.length; attempt++) {
      const engine = candidates[attempt];
      attempts++;

      let candidate: Buffer;
      try {
        if (engine === "klein" || engine === "sd15") {
          candidate = await attemptCloudflareEdit({ parentBytes, prompt, region, frameW, frameH, engine });
        } else {
          usedModel = engine;
          candidate = await attemptEdit({
            parentBytes,
            parentImageUrl,
            userId,
            prompt,
            region,
            frameW,
            frameH,
            model: usedModel,
            seed: Math.floor(Math.random() * 1_000_000),
          });
        }
      } catch (err) {
        lastError = err;
        console.info(
          `[rebuild] edit attempt ${attempt + 1}/${candidates.length} engine=${engine} threw: ` +
            `${err instanceof Error ? err.message : err}`,
        );
        continue;
      }

      report = await measureChange(parentBytes, candidate, region);
      console.info(
        `[rebuild] edit attempt ${attempt + 1}/${candidates.length} engine=${engine} ` +
          `strong=${(report.strongRatio * 100).toFixed(3)}% changed=${(report.changedRatio * 100).toFixed(3)}% ` +
          `bleed=${(report.bleedRatio * 100).toFixed(4)}% landed=${report.landed}`,
      );

      if (report.landed) {
        finalBytes = candidate;
        if (engine === "klein" || engine === "sd15") {
          method = "cloudflare";
          cloudflareEngine = engine;
        } else {
          method = "pollinations";
          usedModel = engine;
        }
        break;
      }
    }

    // Every candidate either threw or produced a no-op, and none of the
    // no-op reports survived to explain why — surface the last real error
    // instead of the generic "produced nothing" when there is one.
    if (!finalBytes && !report && lastError) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    // Refusing to persist a no-op is the point. The old code wrote
    // `status: "complete"` for exactly this case and generated a confident
    // label to go with it, which is why a broken feature looked like a
    // working one for weeks.
    if (!finalBytes || !report) {
      throw new Error(report ? describeNoOp(report, region) : "The edit produced nothing.");
    }

    const editedMeta = await readImageMeta(finalBytes);
    if (editedMeta.width !== frameW || editedMeta.height !== frameH) {
      throw new Error(
        `The edit changed the image's dimensions (${editedMeta.width}x${editedMeta.height}, expected ${frameW}x${frameH}). Refusing to save it.`,
      );
    }

    const blob = await put(`rebuild-versions/${userId}/${randomUUID()}.png`, finalBytes, {
      access: "public",
      contentType: editedMeta.mime,
      addRandomSuffix: false,
    });

    await db
      .update(schema.rebuildVersions)
      .set({
        imageUrl: blob.url,
        width: editedMeta.width,
        height: editedMeta.height,
        stage: "detecting",
        method,
        // The text path uses no model at all, so recording one would be a lie.
        model:
          method === "text"
            ? null
            : method === "cloudflare"
              ? cloudflareEngine === "klein"
                ? "flux-2-klein-9b"
                : "stable-diffusion-v1-5-inpainting"
              : usedModel,
        changedRatio: report.strongRatio,
        attempts,
        fontNote,
      })
      .where(eq(schema.rebuildVersions.id, versionId));

    // The new image is a different image — it gets its own tree, exactly
    // as the initial upload did.
    await detectAndStoreLayers({
      analysisId,
      versionId,
      userId,
      imageBytes: finalBytes,
      meta: editedMeta,
    });

    const label = await summarizeInstruction(instruction);

    await db
      .update(schema.rebuildVersions)
      .set({ status: "complete", stage: null, label })
      .where(eq(schema.rebuildVersions.id, versionId));

    return { versionId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "That edit failed.";
    await db
      .update(schema.rebuildVersions)
      .set({ status: "failed", error: message, stage: null })
      .where(eq(schema.rebuildVersions.id, versionId));
    throw err;
  }
}
