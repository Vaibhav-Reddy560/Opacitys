import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { toolAnswerSchema, toolSourcesSchema } from "@/lib/tools/answer";

const ACCENT = SPECTRUM.balance.color;

export default async function ToolAnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();

  const [row] = await db
    .select({
      question: schema.toolAnswers.question,
      tool: schema.toolAnswers.tool,
      version: schema.toolAnswers.version,
      status: schema.toolAnswers.status,
      error: schema.toolAnswers.error,
      result: schema.toolAnswers.result,
      sources: schema.toolAnswers.sources,
      assetId: schema.toolAnswers.assetId,
      createdAt: schema.toolAnswers.createdAt,
      userId: schema.toolAnswers.userId,
    })
    .from(schema.toolAnswers)
    .where(eq(schema.toolAnswers.id, id))
    .limit(1);

  if (!row || row.userId !== session?.userId) notFound();

  let screenshotUrl: string | null = null;
  if (row.assetId) {
    const [asset] = await db
      .select({ storageKey: schema.assets.storageKey })
      .from(schema.assets)
      .where(eq(schema.assets.id, row.assetId))
      .limit(1);
    screenshotUrl = asset?.storageKey ?? null;
  }

  const parsedResult = row.status === "complete" ? toolAnswerSchema.safeParse(row.result) : null;
  const result = parsedResult?.success ? parsedResult.data : null;
  const sources = toolSourcesSchema.parse(row.sources ?? []);
  const sourceByUrl = new Map(sources.map((s) => [s.url, s.title]));

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/studio/tools"
          className="inline-flex items-center gap-2 text-[13px] text-foreground/55 transition-colors hover:text-foreground/90"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Ask another question
        </Link>

        <div className="mt-8 space-y-6">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The question</h2>
              <span className="font-mono text-[10.5px] text-foreground/45">
                {[row.tool, row.version].filter(Boolean).join(" · ") || "any tool"} ·{" "}
                {new Date(row.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-pretty mt-3 text-[13.5px] leading-relaxed text-foreground/75">{row.question}</p>
            {screenshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not an optimizable local asset
              <img
                src={screenshotUrl}
                alt="Attached screenshot"
                className="mt-4 max-h-[320px] w-full rounded-xl border border-white/[0.08] object-contain"
              />
            )}
          </PrismPanel>

          {(row.status === "queued" || row.status === "running") && (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <p className="text-[13.5px] text-foreground/58">
                {row.status === "queued" ? "Queued — starting shortly." : "Reading this now."}
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
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The answer</h2>
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
              <p className="text-pretty mt-3 text-[14px] leading-relaxed text-foreground/85">{result.answer}</p>

              {result.steps.length > 0 && (
                <div className="mt-4 border-t border-white/[0.07] pt-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Click path</p>
                  <ol className="mt-2 space-y-1.5">
                    {result.steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/72">
                        <span className="font-mono text-[11px] text-foreground/45">{i + 1}.</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {result.versionNote && (
                <p className="mt-4 text-[12px] text-foreground/50">{result.versionNote}</p>
              )}

              {result.caveats.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
                  {result.caveats.map((c, i) => (
                    <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-foreground/55">
                      <span style={{ color: ACCENT }}>—</span>
                      {c}
                    </li>
                  ))}
                </ul>
              )}

              {result.sourceUrls.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                  {result.sourceUrls.map((url) => (
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
          )}
        </div>
      </div>
    </div>
  );
}
