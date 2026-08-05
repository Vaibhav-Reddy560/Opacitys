import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { AnalysisResult } from "@/components/analysis/analysis-result";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db
    .select({
      analysisId: schema.analyses.id,
      status: schema.analyses.status,
      imageUrl: schema.assets.storageKey,
      width: schema.assets.width,
    })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, id))
    .limit(1);

  if (!row) notFound();

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <AnalysisResult
        analysisId={row.analysisId}
        initialStatus={row.status}
        imageUrl={row.imageUrl}
        imageWidth={row.width ?? 0}
      />
    </div>
  );
}
