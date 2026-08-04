import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { MeasuredFacts } from "@/lib/measure";

const ACCENT = SPECTRUM.hierarchy.color;

interface StyleScore {
  name: string;
  era: string | null;
  weight: number; // 0-1
  evidence: string | null;
}

export function StyleBlend({
  summary,
  scores,
  facts,
}: {
  summary: string;
  scores: StyleScore[];
  facts: MeasuredFacts | null;
}) {
  return (
    <div className="space-y-6">
      <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The read</h2>
        <p className="text-pretty mt-3 text-[14px] leading-relaxed text-foreground/85">{summary}</p>

        <div className="mt-7 space-y-5">
          {scores.map((s) => (
            <div key={s.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px]" style={{ fontVariationSettings: '"wght" 550' }}>
                  {s.name}
                </span>
                {s.era && <span className="shrink-0 font-mono text-[10.5px] text-foreground/45">{s.era}</span>}
              </div>
              <div className="mt-2">
                <OpacityMeter value={Math.round(s.weight * 100)} accent={ACCENT} />
              </div>
              {s.evidence && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/55">{s.evidence}</p>
              )}
            </div>
          ))}
        </div>
      </PrismPanel>

      {facts && (
        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
            Measured facts behind the read
          </h2>
          <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {facts.dominantColors.length > 0 && (
              <FactRow label="Dominant colors">
                <div className="flex items-center gap-1.5">
                  {facts.dominantColors.map((hex) => (
                    <span
                      key={hex}
                      className="size-4 rounded-full border border-white/20"
                      style={{ background: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </FactRow>
            )}
            {facts.avgTextContrast !== null && (
              <FactRow label="Avg. text contrast">{facts.avgTextContrast}:1</FactRow>
            )}
            {facts.alignmentRatio !== null && (
              <FactRow label="Alignment ratio">{facts.alignmentRatio}</FactRow>
            )}
            {facts.gapCoefficientOfVariation !== null && (
              <FactRow label="Spacing variation">{facts.gapCoefficientOfVariation}</FactRow>
            )}
            {facts.topBandSaliencyShare !== null && (
              <FactRow label="Top-band visual weight">{facts.topBandSaliencyShare}</FactRow>
            )}
            {facts.distinctTypeSizes !== null && (
              <FactRow label="Distinct type sizes">{facts.distinctTypeSizes}</FactRow>
            )}
          </div>
        </PrismPanel>
      )}
    </div>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] py-2 text-[12.5px]">
      <span className="text-foreground/55">{label}</span>
      <span className="font-mono text-foreground/80">{children}</span>
    </div>
  );
}
