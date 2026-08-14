import Link from "next/link";
import { Fingerprint as FingerprintIcon, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { SelfReported } from "@/components/profile/self-reported";
import { WrittenRead } from "@/components/profile/written-read";
import { PortfolioSection } from "@/components/profile/portfolio-section";
import { readSession } from "@/lib/auth/session";
import { MODULES } from "@/lib/copy";
import { SPECTRUM, DIMENSION_ORDER } from "@/lib/critique/spectrum";
import { computeFingerprint, fingerprintBasis, MIN_SAMPLES } from "@/lib/profile/fingerprint";
import { getStoredProfile } from "@/lib/profile/stored";
import { dribbbleConfigured, dribbbleUnavailableReason, getDribbbleConnection } from "@/lib/portfolio/dribbble";

const MODULE = MODULES.find((m) => m.slug === "profile")!;
const ACCENT = SPECTRUM.rhythm.color;

const SEVERITY_LABEL: Record<string, string> = {
  critical: "critical",
  major: "major",
  minor: "minor",
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="font-mono text-[20px] tabular-nums text-foreground/90">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-foreground/55">{label}</p>
      {note && <p className="text-[10.5px] text-foreground/38">{note}</p>}
    </div>
  );
}

// Server component — every number here is read straight from the DB and
// computed in-process (src/lib/profile/fingerprint.ts). No model call on
// this path; the only one in the module is behind the explicit button in
// WrittenRead.
export default async function ProfilePage() {
  const session = await readSession();
  if (!session) return null; // proxy already gates /studio; this satisfies TS

  const [fp, stored, dribbble] = await Promise.all([
    computeFingerprint(session.userId),
    getStoredProfile(session.userId),
    getDribbbleConnection(session.userId),
  ]);

  const hasSignal =
    fp.styleSignature.length > 0 ||
    fp.craft.perDimension.some((d) => d.sampled >= MIN_SAMPLES) ||
    fp.palette.length > 0;

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<FingerprintIcon className="size-4" aria-hidden />} />

        <div className="space-y-6">
          {/* Honest empty state — nine zeroed bars would imply measurements
              that were never taken, which is the opposite of what this
              module is for. */}
          {!hasSignal ? (
            <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Nothing to read yet</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/65">
                This page is built entirely from your own work — there&rsquo;s nothing here until some exists.
                {fp.uploads > 0
                  ? ` You've uploaded ${fp.uploads} image${fp.uploads === 1 ? "" : "s"}, but ${fp.pieces === 0 ? "none have been analyzed" : "not enough has been analyzed"} yet.`
                  : ""}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/studio/critique"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-5 py-2.5 text-[13px] text-foreground/80 transition-colors hover:text-foreground"
                >
                  Run a Critique <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
                <Link
                  href="/studio/identify"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-5 py-2.5 text-[13px] text-foreground/80 transition-colors hover:text-foreground"
                >
                  Run an Identify <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </PrismPanel>
          ) : (
            <>
              <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">What this reads from</h2>
                <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <Stat label="pieces analyzed" value={String(fp.pieces)} note={`of ${fp.uploads} uploads`} />
                  <Stat label="critiques" value={String(fp.craft.critiques)} />
                  <Stat
                    label="avg critique score"
                    value={fp.craft.avgOverall !== null ? String(fp.craft.avgOverall) : "—"}
                  />
                  <Stat label="originality checks" value={String(fp.originality.checks)} />
                </div>
              </PrismPanel>

              {fp.styleSignature.length > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Style signature</h2>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/55">
                    Ordered by how often a style shows up across your work, not by how strongly it scored once.
                  </p>
                  <div className="mt-5 space-y-3.5">
                    {fp.styleSignature.map((s) => (
                      <div key={s.name}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13px] text-foreground/85">{s.name}</span>
                          <span className="font-mono text-[10.5px] text-foreground/40">
                            {s.appearsIn} piece{s.appearsIn === 1 ? "" : "s"}
                            {s.era ? ` · ${s.era}` : ""}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <OpacityMeter value={s.avgWeight * 100} accent={ACCENT} />
                        </div>
                      </div>
                    ))}
                  </div>
                </PrismPanel>
              )}

              <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Craft</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/55">
                  Your average per dimension across every critique. A dimension the analyzer didn&rsquo;t have
                  enough signal to measure is said so, not scored zero.
                </p>
                <div className="mt-5 space-y-3">
                  {DIMENSION_ORDER.map((dim) => {
                    const stat = fp.craft.perDimension.find((d) => d.dimension === dim)!;
                    return (
                      <div key={dim} className="flex items-center gap-3">
                        <span className="w-[88px] shrink-0 text-[12px] text-foreground/62">
                          {SPECTRUM[dim].label}
                        </span>
                        {stat.avg === null ? (
                          <span className="flex-1 text-[11.5px] text-foreground/38">
                            not enough signal yet
                            {stat.sampled > 0 ? ` (${stat.sampled} of ${MIN_SAMPLES} needed)` : ""}
                          </span>
                        ) : (
                          <>
                            <OpacityMeter value={stat.avg} accent={SPECTRUM[dim].color} className="flex-1" />
                            <span className="w-[62px] shrink-0 text-right font-mono text-[10px] text-foreground/38">
                              {stat.sampled} run{stat.sampled === 1 ? "" : "s"}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {fp.craft.recurringNotes.length > 0 && (
                  <div className="mt-6 border-t border-white/[0.07] pt-5">
                    <h3 className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                      Notes that keep coming back
                    </h3>
                    <ul className="mt-3 space-y-1.5">
                      {fp.craft.recurringNotes.map((n) => (
                        <li
                          key={`${n.dimension}-${n.severity}`}
                          className="flex items-baseline justify-between gap-3 text-[12.5px]"
                        >
                          <span className="text-foreground/72">
                            <span style={{ color: SPECTRUM[n.dimension].color }}>—</span>{" "}
                            {SPECTRUM[n.dimension].label}, {SEVERITY_LABEL[n.severity]}
                          </span>
                          <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">
                            {n.count}&times;
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </PrismPanel>

              {fp.palette.length > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Palette you reach for</h2>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/55">
                    Dominant colors from every piece, grouped by family — the swatch is each group&rsquo;s average.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {fp.palette.map((p) => (
                      <div key={p.bucket} className="w-[72px]">
                        <div
                          className="h-[52px] w-full rounded-lg border border-white/[0.09]"
                          style={{ background: p.hex }}
                        />
                        <p className="mt-1.5 text-[11px] text-foreground/62">{p.label}</p>
                        <p className="font-mono text-[10px] text-foreground/38">
                          {p.hex} · {p.count}&times;
                        </p>
                      </div>
                    ))}
                  </div>
                </PrismPanel>
              )}

              {fp.typeHabits && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                    Type &amp; structure habits
                  </h2>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/55">
                    Medians across every measured piece — what you typically do, not what any one design did.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
                    <Stat
                      label="distinct type sizes"
                      value={fp.typeHabits.medianTypeSizes !== null ? String(fp.typeHabits.medianTypeSizes) : "—"}
                    />
                    <Stat
                      label="text contrast"
                      value={fp.typeHabits.medianContrast !== null ? `${fp.typeHabits.medianContrast}:1` : "—"}
                    />
                    <Stat
                      label="alignment ratio"
                      value={fp.typeHabits.medianAlignment !== null ? String(fp.typeHabits.medianAlignment) : "—"}
                    />
                    <Stat
                      label="spacing variation"
                      value={fp.typeHabits.medianGapCV !== null ? String(fp.typeHabits.medianGapCV) : "—"}
                    />
                  </div>
                </PrismPanel>
              )}

              {fp.originality.checks > 0 && (
                <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                      Originality, over time
                    </h2>
                    {fp.originality.avgCrowding !== null && (
                      <span className="font-mono text-[10.5px] text-foreground/45">
                        avg crowding {fp.originality.avgCrowding}/100
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/55">
                    Every check you&rsquo;ve run, oldest first. This is the record that answers someone calling
                    your work a template.
                  </p>

                  {fp.originality.trend.length > 0 && (
                    <div className="mt-5 space-y-2">
                      {fp.originality.trend.map((t, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="w-[74px] shrink-0 font-mono text-[10.5px] text-foreground/40">
                            {new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          <OpacityMeter value={t.crowding} accent={SPECTRUM.restraint.color} className="flex-1" />
                        </div>
                      ))}
                    </div>
                  )}

                  {fp.originality.territories.length > 0 && (
                    <div className="mt-6 border-t border-white/[0.07] pt-5">
                      <h3 className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                        Territory your directions sat near
                      </h3>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {fp.originality.territories.map((t) => (
                          <li
                            key={t.name}
                            className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-foreground/62"
                          >
                            {t.name}
                            {t.times > 1 && <span className="text-foreground/38"> ×{t.times}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </PrismPanel>
              )}
            </>
          )}

          <WrittenRead
            initial={stored.narrative}
            at={stored.narrativeAt}
            stale={stored.narrative !== null && stored.narrativeBasis !== fingerprintBasis(fp)}
            canNarrate={hasSignal}
          />

          <SelfReported initial={stored} />

          <PortfolioSection
            dribbble={dribbble}
            dribbbleAvailable={dribbbleConfigured()}
            dribbbleUnavailableReason={dribbbleUnavailableReason()}
          />

          <p className="px-1 text-[11.5px] leading-relaxed text-foreground/45">
            Everything above the skills section is measured from your own uploads and recomputed each visit —
            nothing is stored as an opinion. Behance closed its public API and Dribbble no longer returns view
            or like counts, so this doesn&rsquo;t claim to track portfolio numbers.
          </p>
        </div>
      </div>
    </div>
  );
}
