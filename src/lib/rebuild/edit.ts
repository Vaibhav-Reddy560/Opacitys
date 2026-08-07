import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db, schema } from "@/lib/db";
import { generateJson, MODELS } from "@/lib/ai/models";
import { z } from "zod";
import { editImage } from "./pollinations";
import { detectAndStoreLayers, readImageMeta } from "./layers";

/**
 * Applies one natural-language edit to a version's image, producing a new
 * version with its own freshly-detected layer set.
 *
 * The model regenerates the whole frame with the instruction applied — it
 * does not patch pixels — so scoping matters: when the user picked a layer
 * or dragged a region, that context is written into the instruction in
 * words, since that is the only handle a text-conditioned image model has
 * on "this part, not that part".
 */

/** Describes where a box sits, in the language a person would use, for prompt scoping. */
function describeRegion(bbox: [number, number, number, number], imgW: number, imgH: number): string {
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
  region?: [number, number, number, number] | null;
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

    // Scope the instruction in words — the model has no mask, so naming
    // the target is what keeps the edit local.
    let scoped = instruction.trim();
    if (region) {
      const where = describeRegion(region, parentMeta.width, parentMeta.height);
      scoped = layerName
        ? `In the ${layerName} (${where}): ${scoped}`
        : `In ${where}: ${scoped}`;
    } else if (layerName) {
      scoped = `In the ${layerName}: ${scoped}`;
    }

    const editedBytes = await editImage({
      imageUrl: parentImageUrl,
      instruction: scoped,
    });

    const editedMeta = await readImageMeta(editedBytes);
    const ext = editedMeta.mime.split("/")[1];
    const blob = await put(`rebuild-versions/${userId}/${randomUUID()}.${ext}`, editedBytes, {
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
      imageBytes: editedBytes,
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
