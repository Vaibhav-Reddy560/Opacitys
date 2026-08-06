import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db, schema } from "@/lib/db";
import { measureImageFull } from "@/lib/measure";
import { decodeForMeasurement } from "@/lib/measure/image";
import { traceImage, type TracedPath, type Segment } from "./trace";
import { pathToD } from "./trace/svg";
import { decompose, type DesignElement } from "./decompose";
import { nameElements } from "./name";
import { cleanupLayerImage, hasImageGenKey } from "./imagegen";

const PIPELINE_VERSION = "v1-ts";

// Primitives shape.ts assigns only when nothing else matched — literally
// "vectorization gave a poor result", not a subjective quality call. These
// are exactly the elements that render as jagged multi-subpath SVG noise
// (confirmed live: a real upload showing visible static/grain across the
// whole design traced back to hundreds of these). "Blob" and "Icon / mark"
// are excluded deliberately — both are single clean paths or a coherent
// group with real evidence behind them, not a fallback-of-last-resort.
const RASTER_FALLBACK_PRIMITIVES = new Set(["Complex path", "Compound shape"]);

// Each cleanup call is a real paid request (fal.ai, fractions of a cent but
// not free) and takes several seconds — same lesson as NAMING_MAX_ELEMENTS:
// an unbounded per-element AI call blows both budget and pipeline latency
// on a busy image. Every raster-fallback element still gets a real crop of
// its own source pixels (free, no cap) — this only bounds how many
// additionally get the AI cleanup pass, prioritized by area.
const IMAGEGEN_CLEANUP_MAX = 6;

// A busy image can easily decompose into 60+ elements once AA-fringe
// slivers earn their own low-confidence "Divider"/"Blob" entries (confirmed
// live: a 500x260 test image produced 61). Sending all of them to the
// naming call blew straight through Groq's 8000 TPM per-minute limit
// (10483 requested on that run) and silently fell back to deterministic
// names for the WHOLE image — the fallback worked exactly as designed, but
// it made naming useless on any non-trivial upload. A tiny sliver doesn't
// need a creative name anyway ("Divider" already says what it is); only
// the elements large enough to plausibly be a deliberate design choice are
// worth spending naming-call tokens on.
const NAMING_MAX_ELEMENTS = 30;

async function uploadPngBuffer(userId: string, png: Buffer): Promise<string> {
  const blob = await put(`rebuild-masks/${userId}/${randomUUID()}.png`, png, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
  });
  return blob.url;
}

/**
 * Crops the ORIGINAL (source-resolution) image to an element's bbox and
 * uploads it as its own Blob object — used both for `image`-kind (photo)
 * elements, which keep the real pixels rather than a fabricated vector
 * shape, and as the raster-fallback crop for elements that resisted clean
 * vectorization. A layer needs its own URL to render/export independently
 * of the source asset either way.
 */
async function cropAndUpload(
  userId: string,
  imageBytes: Buffer,
  bbox: [number, number, number, number],
  sourceWidth: number,
  sourceHeight: number,
): Promise<string | null> {
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.round(bbox[0])));
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.round(bbox[1])));
  // Clamped against the actual decoded dimensions, not just >=0 — a bbox
  // whose projected right/bottom edge rounds a pixel past the source
  // image's real size (float rounding through the working-image scale
  // factor) makes sharp's extract() throw "bad extract area" outright.
  // Confirmed live: 4 of 348 raster-fallback crops failed this way on a
  // real upload before this clamp.
  const w = Math.max(1, Math.min(sourceWidth - x, Math.round(bbox[2])));
  const h = Math.max(1, Math.min(sourceHeight - y, Math.round(bbox[3])));
  try {
    const cropped = await sharp(imageBytes).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
    return await uploadPngBuffer(userId, cropped);
  } catch (err) {
    console.error("[rebuild] mask crop/upload failed:", err);
    return null;
  }
}

/**
 * Projects a working-image-space bbox to SOURCE pixel coordinates — done
 * exactly once, here, at the pipeline boundary. Every decompose stage runs
 * in working-image space (bounded at MAX_WORKING_EDGE=1600px); doing this
 * per-stage instead would mean every raster op scales with the SOURCE
 * image's potentially-unbounded resolution for zero accuracy gain, since
 * the trace itself already ran on the downscaled image. Same convention
 * measure/index.ts uses for finding bboxes.
 */
function projectBbox(bbox: [number, number, number, number], inv: number): [number, number, number, number] {
  return [bbox[0] * inv, bbox[1] * inv, bbox[2] * inv, bbox[3] * inv];
}

function projectSegment(s: Segment, inv: number): Segment {
  return s.type === "L"
    ? { type: "L", x1: s.x1 * inv, y1: s.y1 * inv, x2: s.x2 * inv, y2: s.y2 * inv }
    : { type: "Q", x1: s.x1 * inv, y1: s.y1 * inv, x2: s.x2 * inv, y2: s.y2 * inv, x3: s.x3 * inv, y3: s.y3 * inv };
}

/**
 * Builds the SVG 'd' attribute for one DesignElement from the paths it
 * owns — decompose() only ever returns bbox/primitive/gradient (the
 * classification evidence), never geometry, so without this every layer
 * would render as its bounding-box rectangle and lose all real shape.
 * Multiple owned outer paths (a same-layer merge, an icon group) become
 * multiple subpaths in one 'd' string, which is valid SVG and renders as
 * one multi-region fill — exactly the same shape a single <path> with
 * disjoint contours already represents elsewhere in this app.
 */
function buildElementD(paths: TracedPath[], pathIndices: number[], inv: number): string {
  let d = "";
  for (const pi of pathIndices) {
    const p = paths[pi];
    if (p.isHole) continue; // holes are rendered as part of their parent's own subpath, never their own
    const segments = p.segments.map((s) => projectSegment(s, inv));
    const holeSegs = p.holeChildren.map((hi) => paths[hi].segments.map((s) => projectSegment(s, inv)));
    d += `${pathToD(segments, holeSegs, 1, 1)} `;
  }
  return d.trim();
}

/**
 * Runs the full Rebuild pipeline for one asset: trace (marching-squares
 * vectorization, src/lib/rebuild/trace) -> decompose (8 deterministic
 * classification stages, src/lib/rebuild/decompose) -> one optional naming
 * pass -> persist analyses + layers rows. Mirrors critique/pipeline.ts's
 * shape: status/stage writes as it goes, catch persists the real failure
 * message then rethrows.
 */
export async function runRebuildPipeline(params: {
  analysisId: string;
  assetId: string;
  userId: string;
  imageUrl: string;
}): Promise<{ analysisId: string }> {
  const { analysisId, assetId, userId, imageUrl } = params;

  await db.update(schema.analyses).set({ status: "running", stage: "tracing" }).where(eq(schema.analyses.id, analysisId));

  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Could not fetch the uploaded image (${imageRes.status}).`);
    }
    const imageBytes = Buffer.from(await imageRes.arrayBuffer());

    // measureImageFull decodes internally for Track A facts (free, no AI
    // tokens — reused across every image-attached feature); traceImage
    // needs the decoded pixel buffers themselves, which measureImageFull
    // doesn't expose, so this is a second (also free) decode.
    const { facts } = await measureImageFull(imageBytes);
    await db.update(schema.assets).set({ facts }).where(eq(schema.assets.id, assetId));

    const decoded = await decodeForMeasurement(imageBytes);
    const { paths } = traceImage(decoded);

    await db.update(schema.analyses).set({ stage: "separating" }).where(eq(schema.analyses.id, analysisId));
    const { elements } = decompose(paths, decoded.rgb, decoded.gray, decoded.width, decoded.height);

    const inv = decoded.scale > 0 ? 1 / decoded.scale : 1;
    const projected: DesignElement[] = elements.map((el) => ({ ...el, bbox: projectBbox(el.bbox, inv) }));

    await db.update(schema.analyses).set({ stage: "naming" }).where(eq(schema.analyses.id, analysisId));
    let names = new Map<string, { name: string; note: string }>();
    try {
      const nameable = [...projected]
        .sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3])
        .slice(0, NAMING_MAX_ELEMENTS);
      names = await nameElements(imageUrl, nameable);
    } catch (err) {
      // Rate limits (or any naming failure) degrade to the deterministic
      // primitive-fitter names already on each element — never the whole run.
      console.error("[rebuild] naming pass failed, using deterministic names:", err);
    }

    const idMap = new Map(projected.map((el) => [el.id, randomUUID()]));

    // Which elements get the raster fallback at all (unbounded — a real
    // crop is free, no external call), and which of THOSE also get the
    // paid AI cleanup pass (bounded, largest-area first).
    const rasterFallback = projected.filter(
      (el) => el.kind === "shape" && el.primitive && RASTER_FALLBACK_PRIMITIVES.has(el.primitive),
    );
    const cleanupBudget = new Set(
      [...rasterFallback]
        .sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3])
        .slice(0, IMAGEGEN_CLEANUP_MAX)
        .map((el) => el.id),
    );
    const canCleanup = hasImageGenKey();

    const rows = await Promise.all(
      projected.map(async (el) => {
        const named = names.get(el.id);
        const isRasterFallback = el.kind === "shape" && el.primitive && RASTER_FALLBACK_PRIMITIVES.has(el.primitive);

        let maskKey: string | null = null;
        let source: "photo" | "raster-cleaned" | "raster-crop" | "traced-vector" = "traced-vector";
        let effectiveKind = el.kind;

        if (el.kind === "image") {
          maskKey = await cropAndUpload(userId, imageBytes, el.bbox, decoded.sourceWidth, decoded.sourceHeight);
          source = "photo";
        } else if (isRasterFallback) {
          effectiveKind = "image"; // reuse the existing raster-layer render/export path wholesale
          const rawUrl = await cropAndUpload(userId, imageBytes, el.bbox, decoded.sourceWidth, decoded.sourceHeight);
          if (rawUrl && canCleanup && cleanupBudget.has(el.id)) {
            try {
              const cleaned = await cleanupLayerImage(rawUrl, named?.name ?? el.name);
              maskKey = await uploadPngBuffer(userId, cleaned);
              source = "raster-cleaned";
            } catch (err) {
              console.error("[rebuild] AI layer cleanup failed, using the raw crop instead:", err);
              maskKey = rawUrl;
              source = "raster-crop";
            }
          } else {
            maskKey = rawUrl;
            source = "raster-crop";
          }
        }

        return {
          id: idMap.get(el.id)!,
          analysisId,
          parentId: el.parentId ? (idMap.get(el.parentId) ?? null) : null,
          zIndex: el.zIndex,
          kind: effectiveKind,
          geometry: {
            bbox: el.bbox,
            primitive: el.primitive ?? null,
            gradient: el.gradient ?? null,
            // Kept even for raster-fallback elements as a fallback-of-the-
            // fallback: if the crop/upload itself fails, the renderer falls
            // through to this traced path rather than showing nothing.
            d: buildElementD(paths, el.pathIndices, inv),
            source,
          },
          style: { fill: el.fill },
          maskKey,
          confidence: el.confidence,
          name: named?.name ?? el.name,
          note: named?.note ?? null,
          hidden: false,
        };
      }),
    );

    if (rows.length > 0) {
      await db.insert(schema.layers).values(rows);
    }

    await db
      .update(schema.analyses)
      .set({
        status: "complete",
        stage: null,
        pipelineVersion: PIPELINE_VERSION,
        raw: { pipelineVersion: PIPELINE_VERSION, width: decoded.sourceWidth, height: decoded.sourceHeight, layerCount: rows.length },
      })
      .where(eq(schema.analyses.id, analysisId));

    return { analysisId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The rebuild pipeline failed.";
    await db.update(schema.analyses).set({ status: "failed", error: message, stage: null }).where(eq(schema.analyses.id, analysisId));
    throw err;
  }
}
