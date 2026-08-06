import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { AnalysisResult } from "@/components/analysis/analysis-result";
import { streamCompleteSchema, type StreamComplete } from "@/lib/critique/types";

/**
 * A visit here is one of three cases, and only one of them needs the SSE
 * round trip `AnalysisResult` falls back to:
 *
 *   - complete -> fetch the critique + findings now and hand them down as
 *     `initialResult`, so the page paints with the real result on the first
 *     render. No stream connection is opened at all.
 *   - failed -> hand down `analyses.error` as `initialError` — previously
 *     only available over SSE, so a direct visit (bookmark, second tab)
 *     showed a generic message even when the real reason was on the row.
 *   - anything else (queued/running) -> neither prop is set;
 *     `AnalysisResult` opens the stream exactly as before.
 */
export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [row] = await db
    .select({
      analysisId: schema.analyses.id,
      status: schema.analyses.status,
      error: schema.analyses.error,
      imageUrl: schema.assets.storageKey,
      width: schema.assets.width,
      userId: schema.assets.userId,
    })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, id))
    .limit(1);

  // A critique is a private result — unlike Currents, this row has no
  // deliberate cross-user cache to keep open. A mismatch reads as "not
  // found" rather than 403 so guessing a uuid can't even confirm one exists.
  if (!row || row.userId !== session?.userId) notFound();

  let initialResult: StreamComplete | null = null;
  if (row.status === "complete") {
    const [critique] = await db
      .select({
        id: schema.critiques.id,
        overallScore: schema.critiques.overallScore,
        dimensionScores: schema.critiques.dimensionScores,
        summary: schema.critiques.summary,
      })
      .from(schema.critiques)
      .where(eq(schema.critiques.analysisId, row.analysisId))
      .limit(1);

    if (critique) {
      const findings = await db
        .select()
        .from(schema.critiqueFindings)
        .where(eq(schema.critiqueFindings.critiqueId, critique.id));

      // Same tolerant schema the SSE path parses with, so the two entry
      // points can never disagree about how to handle a stale row —
      // z.object strips the extra columns (critiqueId, principleId) that
      // select() returns, and a finding referencing a retired dimension is
      // dropped rather than failing the whole parse.
      const parsed = streamCompleteSchema.safeParse({ critique, findings });
      initialResult = parsed.success ? parsed.data : null;
    }
  }

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <AnalysisResult
        analysisId={row.analysisId}
        initialStatus={row.status}
        imageUrl={row.imageUrl}
        imageWidth={row.width ?? 0}
        initialResult={initialResult}
        initialError={row.error}
      />
    </div>
  );
}
