import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { CrowdingResult } from "@/lib/originality/read";

const ACCENT = SPECTRUM.restraint.color;

const BASIS_NOTE =
  "Read against widely-documented movements, studios and campaigns the model knows — not a live index of everything that exists. Treat it as a starting orientation, not a verdict.";

export default async function OriginalityResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db
    .select({
      inputText: schema.originalityChecks.inputText,
      result: schema.originalityChecks.result,
      saturationScore: schema.originalityChecks.saturationScore,
      assetId: schema.originalityChecks.assetId,
    })
    .from(schema.originalityChecks)
    .where(eq(schema.originalityChecks.id, id))
    .limit(1);

  if (!row) notFound();

  let imageUrl: string | null = null;
  if (row.assetId) {
    const [asset] = await db
      .select({ storageKey: schema.assets.storageKey })
      .from(schema.assets)
      .where(eq(schema.assets.id, row.assetId))
      .limit(1);
    imageUrl = asset?.storageKey ?? null;
  }

  const result = row.result as CrowdingResult | null;

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/studio/originality"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Check another direction
        </Link>

        <div className="mt-8 space-y-6">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local/optimizable asset
            <img
              src={imageUrl}
              alt="The attached sketch"
              className="max-h-[360px] w-full rounded-2xl border border-white/[0.08] object-contain"
            />
          )}

          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The direction</h2>
            <p className="text-pretty mt-3 text-[13.5px] leading-relaxed text-foreground/75">{row.inputText}</p>
          </PrismPanel>

          {!result ? (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">No result was recorded for this check.</p>
            </PrismPanel>
          ) : (
            <>
              <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">How crowded it is</h2>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                    style={{
                      color: ACCENT,
                      borderColor: `color-mix(in oklch, ${ACCENT} 30%, transparent)`,
                      background: `color-mix(in oklch, ${ACCENT} 10%, transparent)`,
                    }}
                  >
                    {result.confidence} confidence
                  </span>
                </div>
                <div className="mt-4">
                  <OpacityMeter value={row.saturationScore ?? result.crowding} accent={ACCENT} />
                </div>
              </PrismPanel>

              {result.neighbours.length > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Nearest neighbors</h2>
                  <div className="mt-5 space-y-5">
                    {result.neighbours.map((n) => (
                      <div key={n.name}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13.5px]" style={{ fontVariationSettings: '"wght" 550' }}>
                            {n.name}
                          </span>
                          <span className="font-mono text-[10.5px] text-foreground/45">
                            {n.kind} · {n.era}
                          </span>
                        </div>
                        <div className="mt-2">
                          <OpacityMeter value={n.closeness} accent={ACCENT} showValue={false} />
                        </div>
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/58">{n.whyClose}</p>
                      </div>
                    ))}
                  </div>
                </PrismPanel>
              )}

              {result.distinctives.length > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                    What&rsquo;s distinct about yours
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {result.distinctives.map((d, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/72">
                        <span style={{ color: ACCENT }}>—</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </PrismPanel>
              )}

              {result.moves.length > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                    Moves that widen the gap
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {result.moves.map((m, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/72">
                        <span style={{ color: ACCENT }}>—</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </PrismPanel>
              )}

              <p className="text-[11.5px] leading-relaxed text-foreground/50">{result.basis || BASIS_NOTE}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
