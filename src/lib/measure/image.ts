import "server-only";
import sharp from "sharp";

// Analyzers below run in-process (no separate service, no per-request
// network hop), so a very large upload (up to the 25MB / arbitrary pixel
// dimensions the dropzone allows) would otherwise make the FFT/connected-
// components passes slow. Cap the working resolution and scale every
// measured bbox back into source-image pixel space afterward — the pixel
// space AnnotatedCanvas pins findings against is asset.width/height, i.e.
// the *original* upload, not this working copy.
const MAX_WORKING_EDGE = 1600;

export interface DecodedImage {
  /** Working (possibly downscaled) dimensions — what every analyzer sees. */
  width: number;
  height: number;
  /** Original upload dimensions — what bboxes must be reported in. */
  sourceWidth: number;
  sourceHeight: number;
  /** Multiply a working-space coordinate by 1/scale to get source space. */
  scale: number;
  /** width*height*3, row-major, RGB, alpha flattened onto white. */
  rgb: Uint8ClampedArray;
  /** width*height, row-major, 0-255. */
  gray: Uint8ClampedArray;
}

export async function decodeForMeasurement(input: Buffer | ArrayBuffer): Promise<DecodedImage> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const base = sharp(buf, { failOn: "none" }).rotate(); // auto-orient by EXIF
  const meta = await base.metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image dimensions");
  }

  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = longEdge > MAX_WORKING_EDGE ? MAX_WORKING_EDGE / longEdge : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const resized = scale < 1 ? base.resize(width, height, { fit: "fill" }) : base;

  const [rgbOut, grayOut] = await Promise.all([
    resized.clone().flatten({ background: "#ffffff" }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true }),
    resized.clone().flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true }),
  ]);

  return {
    width: rgbOut.info.width,
    height: rgbOut.info.height,
    sourceWidth,
    sourceHeight,
    scale,
    rgb: new Uint8ClampedArray(rgbOut.data.buffer, rgbOut.data.byteOffset, rgbOut.data.length),
    gray: new Uint8ClampedArray(grayOut.data.buffer, grayOut.data.byteOffset, grayOut.data.length),
  };
}

/** Downscale for a vision-model call — Groq charges a flat ~1.3k tokens per
 * image regardless of resolution up to at least 1024px, so there's no
 * accuracy reason to send anything larger. */
export async function toModelImageDataUrl(input: Buffer | ArrayBuffer): Promise<string> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const jpeg = await sharp(buf, { failOn: "none" })
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
