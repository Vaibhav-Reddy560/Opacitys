import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { trendReadSchema, sourcesSchema, type TrendCurrent } from "@/lib/trends/read";

const ACCENT = SPECTRUM.layout.color;

const BASIS_NOTE =
  "Read from publicly published writing found via live web search, within the timeframe asked for — not a continuously running index of every platform. Treat it as a starting orientation, not a verdict.";

const STAGE_LABEL: Record<TrendCurrent["stage"], string> = {
  emerging: "Emerging",
  peaking: "Peaking",
  established: "Established",
  fading: "Fading",
};

/**
 * A visit here is one of three cases, mirroring
 * src/app/studio/originality/[id]/page.tsx — but unlike Critique's
 * AnalysisResult, this page does not reconnect to the SSE stream for a
 * still-running id. That's a deliberate scope call, not an oversight: the
 * upload page already owns the live wait, and a bookmark/second-tab visit to
 * an in-flight read is not the primary path this feature is built around.
 *
 *   - complete -> parse `result`/`sources` and render the read.
 *   - queued/running -> a plain waiting message, no live update.
 *   - failed -> the real `error` from the row.
 */
export default async function TrendReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await db
    .select({
      scope: schema.trendReads.scope,
      kind: schema.trendReads.kind,
      windowMonths: schema.trendReads.windowMonths,
      status: schema.trendReads.status,
      error: schema.trendReads.error,
      result: schema.trendReads.result,
      sources: schema.trendReads.sources,
      createdAt: schema.trendReads.createdAt,
    })
    .from(schema.trendReads)
    .where(eq(schema.trendReads.id, id))
    .limit(1);

  if (!row) notFound();

  const parsedResult = row.status === "complete" ? trendReadSchema.safeParse(row.result) : null;
  const result = parsedResult?.success ? parsedResult.data : null;
  const sources = sourcesSchema.parse(row.sources ?? []);
  const sourceByUrl = new Map(sources.map((s) => [s.url, s.title]));

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/studio/trends"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Read another scope
        </Link>

        <div className="mt-8 space-y-6">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The scope</h2>
              <span className="font-mono text-[10.5px] text-foreground/45">
                {row.kind ?? "auto"} · last {row.windowMonths} months ·{" "}
                {new Date(row.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-pretty mt-3 text-[13.5px] leading-relaxed text-foreground/75">{row.scope}</p>
          </PrismPanel>

          {(row.status === "queued" || row.status === "running") && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">
                {row.status === "queued"
                  ? "Queued — starting shortly."
                  : "Reading this now — searching and writing it up."}
              </p>
            </PrismPanel>
          )}

          {row.status === "failed" && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
                {row.error ?? "Something went wrong reading this."}
              </p>
            </PrismPanel>
          )}

          {row.status === "complete" && !result && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">No result was recorded for this read.</p>
            </PrismPanel>
          )}

          {result && (
            <>
              <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                    What&rsquo;s moving
                  </h2>
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
                <p className="text-pretty mt-3 text-[13.5px] leading-relaxed text-foreground/75">
                  {result.summary}
                </p>
              </PrismPanel>

              {result.currents.map((c) => (
                <PrismPanel key={c.name} accent={ACCENT} className="p-6 sm:p-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[15px]" style={{ fontVariationSettings: '"wght" 550' }}>
                      {c.name}
                    </h3>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                      style={{ color: ACCENT, borderColor: `color-mix(in oklch, ${ACCENT} 30%, transparent)` }}
                    >
                      {STAGE_LABEL[c.stage]}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                        What it looks like
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground/72">{c.look}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                        Where it came from
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground/72">{c.origin}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                        Why it&rsquo;s catching on
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground/72">{c.why}</p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/[0.07] pt-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                      How to execute it
                    </p>
                    <ol className="mt-2 space-y-1.5">
                      {c.executionSteps.map((s, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/72">
                          <span className="font-mono text-[11px] text-foreground/45">{i + 1}.</span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {c.sourceUrls.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                      {c.sourceUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-white/[0.09] px-2.5 py-1 text-[11px] text-foreground/58 transition-colors hover:border-white/20 hover:text-foreground/85"
                        >
                          {sourceByUrl.get(url) ?? new URL(url).hostname.replace(/^www\./, "")}
                        </a>
                      ))}
                    </div>
                  )}
                </PrismPanel>
              ))}

              {sources.length > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                    Sources consulted
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {sources.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12.5px] text-foreground/62 underline decoration-white/20 underline-offset-2 transition-colors hover:text-foreground/90"
                        >
                          {s.title}
                        </a>
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
