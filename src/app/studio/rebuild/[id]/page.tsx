import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { RebuildEditor } from "@/components/rebuild/rebuild-editor";
import type { EditorLayer, EditorVersion } from "@/components/rebuild/rebuild-editor";

const ACCENT = SPECTRUM.typography.color;

export default async function RebuildResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [row] = await db
    .select({
      analysisId: schema.analyses.id,
      status: schema.analyses.status,
      error: schema.analyses.error,
      userId: schema.assets.userId,
    })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, id))
    .limit(1);

  if (!row || row.userId !== session?.userId) notFound();

  const versionRows =
    row.status === "complete"
      ? await db
          .select()
          .from(schema.rebuildVersions)
          .where(eq(schema.rebuildVersions.analysisId, row.analysisId))
          .orderBy(asc(schema.rebuildVersions.createdAt))
      : [];

  const layerRows =
    versionRows.length > 0
      ? await db
          .select()
          .from(schema.layers)
          .where(eq(schema.layers.analysisId, row.analysisId))
          .orderBy(asc(schema.layers.zIndex))
      : [];

  const versions: EditorVersion[] = versionRows.map((v) => ({
    id: v.id,
    parentId: v.parentId,
    imageUrl: v.imageUrl,
    width: v.width,
    height: v.height,
    instruction: v.instruction,
    label: v.label,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
  }));

  // Grouped by version because each generation has its own tree — switching
  // versions in the editor swaps both the image and its layers.
  const layersByVersion: Record<string, EditorLayer[]> = {};
  for (const l of layerRows) {
    if (!l.versionId) continue; // rows from the old vector pipeline predate versioning
    // jsonb round-trips through `unknown` — tolerate one malformed row
    // rather than failing the whole page, same as trends' sourcesSchema.
    const geo = (l.geometry ?? {}) as { bbox?: number[] };
    const bbox = Array.isArray(geo.bbox) && geo.bbox.length === 4 ? (geo.bbox as [number, number, number, number]) : null;
    if (!bbox) continue;
    (layersByVersion[l.versionId] ??= []).push({
      id: l.id,
      parentId: l.parentId,
      zIndex: l.zIndex,
      kind: l.kind,
      bbox,
      thumbUrl: l.maskKey,
      name: l.name ?? l.kind,
      note: l.note,
      hidden: l.hidden,
      confidence: l.confidence,
    });
  }

  const hasEditor = versions.some((v) => v.status === "complete" && v.imageUrl);

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/studio/rebuild"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Take apart another
        </Link>

        <div className="mt-8 space-y-6">
          {(row.status === "queued" || row.status === "running") && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">
                {row.status === "queued" ? "Queued — starting shortly." : "Reading this design now."}
              </p>
            </PrismPanel>
          )}

          {row.status === "failed" && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
                {row.error ?? "Something went wrong reading this design."}
              </p>
            </PrismPanel>
          )}

          {row.status === "complete" && !hasEditor && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">No layers were found in this image.</p>
            </PrismPanel>
          )}

          {hasEditor && (
            <RebuildEditor
              analysisId={row.analysisId}
              versions={versions}
              layersByVersion={layersByVersion}
              accent={ACCENT}
            />
          )}
        </div>
      </div>
    </div>
  );
}
