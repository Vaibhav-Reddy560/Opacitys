import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hasGeminiKey } from "./gemini";
import { detectAndStoreLayers, readImageMeta } from "./layers";

const PIPELINE_VERSION = "v2-semantic";

/**
 * Rebuild's initial pass: read the upload, record it as version 0 of the
 * session, and detect the semantic layers in it.
 *
 * No vectorization, no pixel classification — the layer set is whatever a
 * vision model recognizes as a distinct element (a logo, a button, a
 * headline, a section), which is what a designer actually wants named in a
 * layers panel. Editing happens later, per version, in ./edit.ts.
 *
 * Mirrors critique/pipeline.ts's shape: status/stage written as it goes,
 * catch persists the real failure message before rethrowing.
 */
export async function runRebuildPipeline(params: {
  analysisId: string;
  assetId: string;
  userId: string;
  imageUrl: string;
}): Promise<{ analysisId: string; versionId: string }> {
  const { analysisId, userId, imageUrl } = params;

  await db
    .update(schema.analyses)
    .set({ status: "running", stage: "reading" })
    .where(eq(schema.analyses.id, analysisId));

  try {
    if (!hasGeminiKey()) {
      throw new Error("Rebuild needs a GEMINI_API_KEY. Add one to .env.local — it's free at aistudio.google.com.");
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Could not fetch the uploaded image (${imageRes.status}).`);
    }
    const imageBytes = Buffer.from(await imageRes.arrayBuffer());
    const meta = await readImageMeta(imageBytes);

    // Version 0 IS the upload — it points at the asset's own Blob URL
    // rather than a copy, and completes immediately because there is
    // nothing to generate.
    const [version] = await db
      .insert(schema.rebuildVersions)
      .values({
        analysisId,
        parentId: null,
        imageUrl,
        width: meta.width,
        height: meta.height,
        instruction: null,
        label: "Original",
        status: "complete",
        stage: null,
      })
      .returning({ id: schema.rebuildVersions.id });

    await db
      .update(schema.analyses)
      .set({ stage: "detecting" })
      .where(eq(schema.analyses.id, analysisId));

    const layerCount = await detectAndStoreLayers({
      analysisId,
      versionId: version.id,
      userId,
      imageBytes,
      meta,
    });

    await db
      .update(schema.analyses)
      .set({
        status: "complete",
        stage: null,
        pipelineVersion: PIPELINE_VERSION,
        raw: {
          pipelineVersion: PIPELINE_VERSION,
          width: meta.width,
          height: meta.height,
          layerCount,
          rootVersionId: version.id,
        },
      })
      .where(eq(schema.analyses.id, analysisId));

    return { analysisId, versionId: version.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The rebuild failed.";
    await db
      .update(schema.analyses)
      .set({ status: "failed", error: message, stage: null })
      .where(eq(schema.analyses.id, analysisId));
    throw err;
  }
}
