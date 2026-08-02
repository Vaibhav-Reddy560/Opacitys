import "server-only";
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { analyzerResponseSchema } from "./types";
import { groundCritique } from "./grounding";

const PIPELINE_VERSION = "v1";

/**
 * Runs the full two-track critique pipeline for one asset:
 *   Track A (Python service) -> deterministic measurements
 *   Track B (Claude via grounding.ts) -> explanation grounded in those measurements
 * Persists analyses/critiques/critique_findings and returns the critique id.
 */
export async function runCritiquePipeline(params: {
  analysisId: string;
  imageUrl: string;
}): Promise<{ critiqueId: string }> {
  const { analysisId, imageUrl } = params;

  await db
    .update(schema.analyses)
    .set({ status: "running" })
    .where(eq(schema.analyses.id, analysisId));

  const analyzerUrl = process.env.ANALYZER_SERVICE_URL;
  if (!analyzerUrl) {
    throw new Error("ANALYZER_SERVICE_URL is not set. Add it to .env.local.");
  }

  const res = await fetch(`${analyzerUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!res.ok) {
    await db
      .update(schema.analyses)
      .set({ status: "failed" })
      .where(eq(schema.analyses.id, analysisId));
    throw new Error(`Analyzer service failed: ${res.status} ${await res.text()}`);
  }

  const trackA = analyzerResponseSchema.parse(await res.json());

  await db
    .update(schema.analyses)
    .set({ raw: trackA, pipelineVersion: PIPELINE_VERSION })
    .where(eq(schema.analyses.id, analysisId));

  const result = await groundCritique(imageUrl, trackA);

  // Resolve the VLM's human principleSlug values to real design_principles
  // rows. Unknown slugs (VLM typo, or a principle not yet seeded) resolve to
  // null rather than failing the whole critique.
  const slugs = [...new Set(result.findings.map((f) => f.principleSlug).filter((s): s is string => s !== null))];
  const principleIdBySlug = new Map<string, string>();
  if (slugs.length > 0) {
    const rows = await db
      .select({ id: schema.designPrinciples.id, slug: schema.designPrinciples.slug })
      .from(schema.designPrinciples)
      .where(inArray(schema.designPrinciples.slug, slugs));
    for (const row of rows) principleIdBySlug.set(row.slug, row.id);
  }

  const [critique] = await db
    .insert(schema.critiques)
    .values({
      analysisId,
      overallScore: result.overallScore,
      dimensionScores: result.dimensionScores,
      summary: result.summary,
      model: "anthropic/claude-opus-5",
    })
    .returning({ id: schema.critiques.id });

  if (result.findings.length > 0) {
    await db.insert(schema.critiqueFindings).values(
      result.findings.map((f) => ({
        critiqueId: critique.id,
        dimension: f.dimension,
        severity: f.severity,
        bbox: f.bbox,
        principleId: f.principleSlug ? (principleIdBySlug.get(f.principleSlug) ?? null) : null,
        measured: f.measured,
        message: f.message,
        fix: f.fix,
        confidence: f.confidence,
      })),
    );
  }

  await db
    .update(schema.analyses)
    .set({ status: "complete" })
    .where(eq(schema.analyses.id, analysisId));

  return { critiqueId: critique.id };
}
