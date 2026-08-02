import { Compass } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "originality")!;

export default function OriginalityPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Compass className="size-4" aria-hidden />} />
        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Describe or sketch the direction",
              body: "A rough image, a moodboard, or just a written description of the idea. This runs before you commit a week to it, which is the whole point.",
            },
            {
              title: "Measure distance, not similarity",
              body: "The direction gets embedded and compared against an index of existing work. The useful number is how far you are from the nearest cluster, and how dense that neighbourhood is.",
            },
            {
              title: "Show you the neighbours",
              body: "The closest existing work, so you can judge for yourself whether it is genuinely close or just shares a palette.",
            },
            {
              title: "Give you something to point at",
              body: "If it turns out your direction is unusually distant from anything indexed, that is evidence — useful the next time somebody calls your work a template.",
            },
          ]}
          requires={["reference index", "CLIP embeddings", "density scoring"]}
        />
      </div>
    </div>
  );
}
