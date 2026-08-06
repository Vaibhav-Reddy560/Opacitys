import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { RebuildCanvas } from "@/components/rebuild/rebuild-canvas";
import type { RebuildLayer } from "@/components/rebuild/rebuild-canvas";

const ACCENT = SPECTRUM.typography.color;

export default async function RebuildResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [row] = await db
    .select({
      analysisId: schema.analyses.id,
      status: schema.analyses.status,
      error: schema.analyses.error,
      raw: schema.analyses.raw,
      imageUrl: schema.assets.storageKey,
      width: schema.assets.width,
      height: schema.assets.height,
      userId: schema.assets.userId,
    })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, id))
    .limit(1);

  if (!row || row.userId !== session?.userId) notFound();

  // `analyses.raw` carries the SOURCE dimensions the pipeline actually
  // decoded and traced against, independent of whatever the upload step
  // recorded on `assets.width/height` — an upload path that skips sending
  // those (a real bug, since fixed in rebuild-form.tsx) would otherwise
  // collapse the SVG's viewBox to "0 0 1 1" while every layer's geometry is
  // sized in real pixel coordinates, rendering a blank canvas. Preferring
  // `raw` here means an already-affected analysis self-heals without
  // needing to be rerun.
  const raw = (row.raw ?? {}) as { width?: number; height?: number };
  const canvasWidth = raw.width ?? row.width ?? 0;
  const canvasHeight = raw.height ?? row.height ?? 0;

  let layers: RebuildLayer[] = [];
  if (row.status === "complete") {
    const rows = await db
      .select({
        id: schema.layers.id,
        parentId: schema.layers.parentId,
        zIndex: schema.layers.zIndex,
        kind: schema.layers.kind,
        geometry: schema.layers.geometry,
        style: schema.layers.style,
        maskKey: schema.layers.maskKey,
        confidence: schema.layers.confidence,
        name: schema.layers.name,
        note: schema.layers.note,
        hidden: schema.layers.hidden,
      })
      .from(schema.layers)
      .where(eq(schema.layers.analysisId, row.analysisId))
      .orderBy(asc(schema.layers.zIndex));

    // jsonb round-trips through `unknown` — tolerate a malformed geometry
    // rather than failing the whole page over one bad row, same pattern as
    // trends' sourcesSchema and tools' toolSourcesSchema.
    layers = rows.map((r) => {
      const geometry = (r.geometry ?? {}) as {
        bbox?: number[];
        primitive?: string | null;
        gradient?: RebuildLayer["gradient"];
        d?: string;
        source?: RebuildLayer["source"];
      };
      const style = (r.style ?? {}) as { fill?: string };
      return {
        id: r.id,
        parentId: r.parentId,
        zIndex: r.zIndex,
        kind: r.kind as RebuildLayer["kind"],
        bbox: (geometry.bbox as [number, number, number, number] | undefined) ?? [0, 0, 0, 0],
        primitive: geometry.primitive ?? null,
        gradient: geometry.gradient ?? null,
        d: geometry.d ?? "",
        source: geometry.source ?? null,
        fill: style.fill ?? "#808080",
        maskKey: r.maskKey,
        confidence: r.confidence,
        name: r.name ?? "Layer",
        note: r.note,
        hidden: r.hidden,
      };
    });
  }

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
                {row.status === "queued" ? "Queued — starting shortly." : "Taking this apart now."}
              </p>
            </PrismPanel>
          )}

          {row.status === "failed" && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
                {row.error ?? "Something went wrong taking this apart."}
              </p>
            </PrismPanel>
          )}

          {row.status === "complete" && layers.length === 0 && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">No layers were recovered from this image.</p>
            </PrismPanel>
          )}

          {row.status === "complete" && layers.length > 0 && (
            <RebuildCanvas
              layers={layers}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              accent={ACCENT}
            />
          )}
        </div>
      </div>
    </div>
  );
}
