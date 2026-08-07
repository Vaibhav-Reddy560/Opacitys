import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db, schema } from "@/lib/db";
import { detectLayers } from "./gemini";
import { buildTree, autoNumberNames } from "./tree";

/**
 * Detect the semantic layers in one version's image and persist them.
 *
 * Shared by the initial pipeline and every subsequent edit — an edit
 * produces a new image, and that image gets its own freshly-detected layer
 * set (the tree is a property of the image, not of the session).
 */

/**
 * A design decomposes into elements a designer would name, not into
 * hundreds of fragments. Zero means detection failed; a flood means it
 * misread the image as texture. Either way it is a real failure worth
 * surfacing, not a result worth persisting — the previous vector pipeline
 * shipping 681 "Complex path" layers is exactly what this gate exists to
 * prevent from ever happening silently again.
 */
const MIN_LAYERS = 1;
const MAX_LAYERS = 60;

/** Thumbnails are for a ~40px panel row; anything larger is wasted bytes and upload time. */
const THUMB_MAX_EDGE = 256;

export interface StoredImageMeta {
  width: number;
  height: number;
  mime: string;
}

/** Reads real dimensions off the bytes rather than trusting a DB column — assets.width/height can be null. */
export async function readImageMeta(imageBytes: Buffer): Promise<StoredImageMeta> {
  const meta = await sharp(imageBytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("Could not read that image's dimensions.");
  const format = meta.format === "jpeg" ? "jpeg" : meta.format === "webp" ? "webp" : "png";
  return { width, height, mime: `image/${format}` };
}

async function cropThumbnail(
  userId: string,
  imageBytes: Buffer,
  bbox: [number, number, number, number],
  imgW: number,
  imgH: number,
): Promise<string | null> {
  // Clamped against the real decoded size — a box whose edge rounds a pixel
  // past the frame makes sharp's extract() throw "bad extract area" outright.
  const x = Math.max(0, Math.min(imgW - 1, Math.round(bbox[0])));
  const y = Math.max(0, Math.min(imgH - 1, Math.round(bbox[1])));
  const w = Math.max(1, Math.min(imgW - x, Math.round(bbox[2])));
  const h = Math.max(1, Math.min(imgH - y, Math.round(bbox[3])));
  try {
    const png = await sharp(imageBytes)
      .extract({ left: x, top: y, width: w, height: h })
      .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const blob = await put(`rebuild-thumbs/${userId}/${randomUUID()}.png`, png, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });
    return blob.url;
  } catch (err) {
    // A missing thumbnail costs that row its preview, not the whole run.
    console.error("[rebuild] thumbnail crop/upload failed:", err);
    return null;
  }
}

export async function detectAndStoreLayers(params: {
  analysisId: string;
  versionId: string;
  userId: string;
  imageBytes: Buffer;
  meta: StoredImageMeta;
}): Promise<number> {
  const { analysisId, versionId, userId, imageBytes, meta } = params;

  const detected = await detectLayers({
    imageBytes,
    mime: meta.mime,
    width: meta.width,
    height: meta.height,
  });

  if (detected.length < MIN_LAYERS) {
    throw new Error("Nothing recognizable was found in that image. Try a clearer design.");
  }
  if (detected.length > MAX_LAYERS) {
    throw new Error(
      `That image broke into ${detected.length} pieces, which usually means it was read as texture rather than a design. Try a flatter graphic.`,
    );
  }

  // buildTree assigns parentId + zIndex and returns the array in paint
  // order, which is also the order the panel lists them — so numbering
  // afterward reads top-to-bottom rather than arbitrarily.
  const ordered = buildTree(
    detected.map((d) => ({
      id: randomUUID(),
      bbox: d.bbox,
      kind: d.kind,
      parentId: null as string | null,
      zIndex: 0,
      label: d.label,
      note: d.note,
      confidence: d.confidence,
    })),
  );

  // Named off `label` when the model gave a useful one, else the bare kind
  // — either way auto-numbered per repeated name ("text", "text 2").
  const names = autoNumberNames(ordered.map((el) => ({ kind: el.kind, name: el.label })));

  const thumbs = await Promise.all(
    ordered.map((el) => cropThumbnail(userId, imageBytes, el.bbox, meta.width, meta.height)),
  );

  await db.insert(schema.layers).values(
    ordered.map((el, i) => ({
      id: el.id,
      analysisId,
      versionId,
      parentId: el.parentId,
      zIndex: el.zIndex,
      kind: el.kind,
      geometry: { bbox: el.bbox },
      style: {},
      maskKey: thumbs[i],
      confidence: el.confidence,
      name: names[i],
      note: el.note,
      hidden: false,
    })),
  );

  return ordered.length;
}
