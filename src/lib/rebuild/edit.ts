import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db, schema } from "@/lib/db";
import { generateJson, MODELS } from "@/lib/ai/models";
import { z } from "zod";
import { editImage as pollinationsEdit, nearestGptimageRatio } from "./pollinations";
import { detectAndStoreLayers, readImageMeta } from "./layers";

/**
 * Applies one natural-language edit to a version's image, producing a new
 * version with its own freshly-detected layer set.
 *
 * A SCOPED edit (a layer or a marquee region) crops that region out at full
 * resolution, edits ONLY the crop, and composites the result back onto the
 * untouched original — so a one-word text fix on a 6480x3240 logo comes back
 * at 6480x3240 with everything outside the edited box pixel-identical to the
 * source, not redrawn from scratch at 1024x1024. A whole-image edit (no
 * region) has no "untouched area" to preserve by definition — the entire
 * frame is regenerated, same as before, still resized back to the source's
 * own resolution rather than left at whatever fixed size the model used.
 */

type Box = [number, number, number, number]; // [x, y, w, h], pixel space

/** How much real context to grow a selection by before cropping, so the model has surrounding style/color/font to match against. */
const CONTEXT_PAD = 0.12;
/**
 * Fixed pixels of breathing room added to the SELECTION (not the context
 * crop) before it becomes the opaque region in the final composite — just
 * enough that a hard mask edge doesn't clip anti-aliased glyph edges.
 * Deliberately tiny and fixed, not a percentage: growing the actually-baked
 * region with the selection size would defeat the point of scoping the edit.
 */
const EDIT_PAD_PX = 6;
/** How wide a blend to feather at the composite boundary, hiding any resize/re-encode seam. */
const FEATHER_PX = 10;
/**
 * Reshaping a crop toward one of gptimage's fixed ratios (for its much
 * better text fidelity — measured: FLUX-family models mangle rendered text,
 * gptimage does not) means growing the crop, which sweeps in more real
 * design content. This caps how much: beyond 4x the padded box's area, the
 * extra content pulled in isn't worth the text-fidelity gain, and the crop
 * is left alone — editImage() will then pick klein instead (exact geometry,
 * weaker text), which is the right tradeoff for a thin, extreme-aspect
 * selection like a single line of text.
 */
const MAX_GROWTH_AREA = 4;

/** Clamp a box to the frame the same way cropThumbnail (layers.ts) does — clamp the origin first, then fit the size to what's left, so sharp's extract() never sees an out-of-bounds rectangle. */
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
 * Decides the actual crop for a scoped edit: try reshaping toward
 * gptimage's best-fit ratio (better text), but only if that doesn't sweep
 * in disproportionately more real content than the plain context-padded
 * selection. See MAX_GROWTH_AREA.
 */
function planCropBox(region: Box, frameW: number, frameH: number): Box {
  const padded = expandForContext(region, frameW, frameH);
  const idealRatio = nearestGptimageRatio(padded[2] / padded[3]);
  const grown = growToRatio(padded, idealRatio, frameW, frameH);
  const paddedArea = padded[2] * padded[3];
  const grownArea = grown[2] * grown[3];
  return grownArea <= paddedArea * MAX_GROWTH_AREA ? grown : padded;
}

/** Average color of a box's four corners — the box was context-padded specifically so its corners land on real background rather than the edited element itself. */
async function sampleBackground(imageBytes: Buffer, [x, y, w, h]: Box): Promise<{ r: number; g: number; b: number }> {
  const size = Math.max(2, Math.min(8, Math.floor(Math.min(w, h) * 0.05)));
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
  for (const [cx, cy] of corners) {
    const { data, info } = await sharp(imageBytes)
      .extract({ left: Math.max(0, Math.round(cx)), top: Math.max(0, Math.round(cy)), width: size, height: size })
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
  return { r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n) };
}

/**
 * An alpha mask, the size of the full crop sent to the model, that is
 * opaque ONLY over `inner` (feathered at its edges) and fully transparent
 * everywhere else.
 *
 * This is what keeps the context grown around a selection (see
 * planCropBox — real neighboring content, swept in purely so the model has
 * style/font/color to match against) from being permanently baked into the
 * result: outside `inner`, the mask is 0, so compositing the model's patch
 * "over" the original leaves the original — pixels AND alpha — completely
 * untouched. Only `inner` (the actual selection, plus a small fixed pad for
 * softness) becomes opaque, which is the whole point of cropping instead of
 * regenerating the whole frame.
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

/**
 * The crop sent to the model was flattened onto a flat `bg` color, because
 * the model has no concept of transparency. It was told to preserve that
 * background, and it mostly does — which means most of what comes back
 * inside the edited region is really still "background", not new content.
 * Left alone, regionMask would force that whole area opaque, turning
 * transparent space around a piece of text into a solid rectangle.
 *
 * This keys the patch against the exact `bg` it was flattened onto: pixels
 * close to `bg` (untouched by the edit) go transparent, pixels far from it
 * (actual new content — glyph strokes, a redrawn shape) stay opaque, with a
 * short ramp between so edges anti-alias instead of banding.
 */
function contentMask(patchRGB: Buffer, w: number, h: number, bg: { r: number; g: number; b: number }): Buffer {
  const THRESHOLD = 24;
  const RAMP = 48; // full opacity once a pixel is this far from bg
  const out = Buffer.alloc(w * h);
  for (let i = 0, p = 0; p < out.length; i += 3, p++) {
    const d = Math.max(Math.abs(patchRGB[i] - bg.r), Math.abs(patchRGB[i + 1] - bg.g), Math.abs(patchRGB[i + 2] - bg.b));
    out[p] = d <= THRESHOLD ? 0 : d >= THRESHOLD + RAMP ? 255 : Math.round(((d - THRESHOLD) / RAMP) * 255);
  }
  return out;
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
 * Cheapest model in the app, and a failure just falls back to a truncation
 * of the instruction — never worth failing an otherwise-good edit over.
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
  const { versionId, analysisId, userId, parentImageUrl, instruction, layerName, region } = params;

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

    let finalBytes: Buffer;

    if (region) {
      // ── SCOPED PATH: edit a crop, composite it back onto the untouched original ──
      const cropBox = planCropBox(region, frameW, frameH);
      const [cx, cy, cw, ch] = cropBox;
      const bg = await sampleBackground(parentBytes, cropBox);

      const cropPng = await sharp(parentBytes)
        .extract({ left: cx, top: cy, width: cw, height: ch })
        .flatten({ background: bg })
        .png()
        .toBuffer();
      const cropBlob = await put(`rebuild-crops/${userId}/${randomUUID()}.png`, cropPng, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
      });

      const where = describeRegion(region, frameW, frameH);
      const target = layerName ? `the ${layerName} (${where})` : where;
      const scoped = `In ${target}: ${instruction.trim()}. Preserve everything else in the image exactly: the same font, weight, color, letter spacing, position, and background. Do not move, resize, recolor or remove anything else.`;

      const edited = await pollinationsEdit({ imageUrl: cropBlob.url, instruction: scoped, width: cw, height: ch });

      // The model may have snapped to a fixed output size (gptimage) —
      // resize back to the crop's true pixel box before compositing.
      const patch = await sharp(edited.bytes).resize(cw, ch, { fit: "fill" }).removeAlpha().toBuffer();
      const patchRaw = await sharp(patch).raw().toBuffer();

      // Only the true selection (region), not the whole context crop,
      // becomes opaque in the result — see regionMask's doc comment.
      const innerLocal: Box = [
        region[0] - cx - EDIT_PAD_PX,
        region[1] - cy - EDIT_PAD_PX,
        region[2] + EDIT_PAD_PX * 2,
        region[3] + EDIT_PAD_PX * 2,
      ];
      // Both masks have to agree a pixel is real, edited content: inside
      // the selection AND visibly different from the flat color the crop
      // was flattened onto (see contentMask's doc comment) — otherwise the
      // "background" the model dutifully preserved becomes an opaque block
      // instead of staying transparent.
      const boundsMask = await regionMask(cw, ch, innerLocal, FEATHER_PX);
      const editMask = contentMask(patchRaw, cw, ch, bg);
      const combinedMask = Buffer.alloc(cw * ch);
      for (let i = 0; i < combinedMask.length; i++) combinedMask[i] = Math.min(boundsMask[i], editMask[i]);
      // contentMask is a per-pixel threshold against JPEG-compressed source
      // bytes, which is naturally a little noisy at a glyph's edge — a
      // light blur turns that salt-and-pepper edge into a clean anti-alias
      // instead of visible speckle.
      const finalMask = await sharp(combinedMask, { raw: { width: cw, height: ch, channels: 1 } })
        .blur(1)
        .raw()
        .toBuffer();

      const patchRGBA = await sharp(patch)
        .joinChannel(finalMask, { raw: { width: cw, height: ch, channels: 1 } })
        .png()
        .toBuffer();

      finalBytes = await sharp(parentBytes)
        .ensureAlpha()
        .composite([{ input: patchRGBA, left: cx, top: cy }])
        .png()
        .toBuffer();
    } else {
      // ── WHOLE-FRAME PATH: no untouched area to preserve — the whole frame regenerates ──
      const scoped = `${instruction.trim()}. Keep everything else in the image exactly as it is — same layout, same colors, same typography, same style. Change only what was asked for.`;
      const edited = await pollinationsEdit({ imageUrl: parentImageUrl, instruction: scoped, width: frameW, height: frameH });
      finalBytes = await sharp(edited.bytes).resize(frameW, frameH, { fit: "fill" }).png().toBuffer();
    }

    const editedMeta = await readImageMeta(finalBytes);
    if (editedMeta.width !== frameW || editedMeta.height !== frameH) {
      // Should be structurally impossible given the resize above — a real
      // mismatch here means a future edit to this function broke the
      // dimension contract, and that is worth failing loudly on rather
      // than silently persisting a version at the wrong size.
      console.error(`[rebuild] edit produced ${editedMeta.width}x${editedMeta.height}, expected ${frameW}x${frameH}`);
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
