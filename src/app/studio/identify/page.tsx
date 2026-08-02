import { Aperture } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { PrismPanel, OpacityMeter } from "@/components/brand/prism";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "identify")!;

/**
 * The style taxonomy this reads against. Shown as the actual vocabulary rather
 * than a fake result, so the page is informative without inventing an analysis.
 */
const TAXONOMY_SAMPLE = [
  "Swiss / International",
  "Brutalist",
  "Editorial",
  "Bauhaus",
  "Y2K chrome",
  "Memphis",
  "Vaporwave",
  "Neo-grotesque",
  "Art Deco",
  "Psychedelic",
  "Constructivist",
  "Maximalist collage",
  "Minimal utility",
  "Acid graphics",
  "Risograph",
  "Corporate Memphis",
];

export default function IdentifyPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Aperture className="size-4" aria-hidden />} />

        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Read against a labelled taxonomy",
              body: "Over a hundred design types, each anchored by hand-picked exemplars. Scoring is similarity to those exemplars, which is what makes the answer reproducible — ask twice, get the same mix.",
            },
            {
              title: "Return a proportion, not a label",
              body: "Almost nothing is purely one style. The output is a weighted blend with a dominant reading, because that is how designs actually sit.",
            },
            {
              title: "Show the evidence",
              body: "Each percentage links to the specific features driving it — the grid, the type classification, the palette structure — so you can disagree with it on specifics.",
            },
          ]}
          requires={["taxonomy labelling", "exemplar embeddings", "calibration set"]}
        >
          <PrismPanel accent={SPECTRUM.hierarchy.color} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              The vocabulary
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/58">
              A sample of the taxonomy being built. Classification is only as good
              as this list, so it is curated by hand rather than generated.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {TAXONOMY_SAMPLE.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-foreground/62"
                >
                  {t}
                </li>
              ))}
              <li className="rounded-full border border-dashed border-white/[0.12] px-2.5 py-1 text-[11.5px] text-foreground/50">
                + the rest, in progress
              </li>
            </ul>

            <div className="mt-7 border-t border-white/[0.07] pt-5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">
                Taxonomy coverage
              </p>
              <div className="mt-3 max-w-xs">
                <OpacityMeter value={16} accent={SPECTRUM.hierarchy.color} />
              </div>
            </div>
          </PrismPanel>
        </Blueprint>
      </div>
    </div>
  );
}
