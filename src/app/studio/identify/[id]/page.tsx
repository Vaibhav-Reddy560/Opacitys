import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { StyleBlend } from "@/components/identify/style-blend";
import type { MeasuredFacts } from "@/lib/measure";

export default async function IdentifyResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [row] = await db
    .select({
      status: schema.analyses.status,
      error: schema.analyses.error,
      raw: schema.analyses.raw,
      imageUrl: schema.assets.storageKey,
      userId: schema.assets.userId,
    })
    .from(schema.analyses)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.analyses.assetId))
    .where(eq(schema.analyses.id, id))
    .limit(1);

  if (!row || row.userId !== session?.userId) notFound();

  const shell = (children: React.ReactNode) => (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/studio/identify"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Read another design
        </Link>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );

  if (row.status === "failed") {
    return shell(
      <div className="grid min-h-[40svh] place-content-center text-center">
        <AlertTriangle className="mx-auto size-7" style={{ color: "oklch(0.72 0.19 18)" }} aria-hidden />
        <p className="mt-4 text-lg tracking-tight" style={{ fontVariationSettings: '"wght" 500' }}>
          The read failed
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-foreground/55">
          {row.error ?? "Something went wrong. Try uploading it again."}
        </p>
      </div>,
    );
  }

  if (row.status !== "complete") {
    return shell(
      <div className="grid min-h-[40svh] place-content-center text-center">
        <p className="text-[13.5px] text-foreground/58">Still reading this one — refresh in a moment.</p>
      </div>,
    );
  }

  const [read] = await db
    .select({ summary: schema.styleReads.summary })
    .from(schema.styleReads)
    .where(eq(schema.styleReads.analysisId, id))
    .limit(1);

  const scores = await db
    .select({
      weight: schema.styleScores.weight,
      evidence: schema.styleScores.evidence,
      name: schema.styleTaxonomy.name,
      era: schema.styleTaxonomy.era,
    })
    .from(schema.styleScores)
    .innerJoin(schema.styleTaxonomy, eq(schema.styleTaxonomy.id, schema.styleScores.taxonomyId))
    .where(eq(schema.styleScores.analysisId, id))
    .orderBy(desc(schema.styleScores.weight));

  const raw = row.raw as { facts?: MeasuredFacts } | null;
  const facts = raw?.facts ?? null;

  return shell(
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local/optimizable asset */}
      <img
        src={row.imageUrl}
        alt="The uploaded design"
        className="mb-6 max-h-[420px] w-full rounded-2xl border border-white/[0.08] object-contain"
      />
      <StyleBlend
        summary={read?.summary ?? "No summary was recorded for this read."}
        scores={scores.map((s) => ({
          name: s.name,
          era: s.era,
          weight: s.weight,
          evidence: (s.evidence as { text?: string } | null)?.text ?? null,
        }))}
        facts={facts}
      />
    </>,
  );
}
