import { Layers } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "rebuild")!;

export default function RebuildPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Layers className="size-4" aria-hidden />} />
        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Separate into layers",
              body: "Segmentation, depth ordering and inpainting recover what sits behind what. This works well on flat graphic design — posters, logos, type, UI — and poorly on photographic composites, so the interface will show a confidence score per layer and let you correct it rather than pretend it is certain.",
            },
            {
              title: "Name every element",
              body: "Each layer gets classified — shape, type, gradient, texture, effect — with its geometry and styling read off the pixels and written into an editable document.",
            },
            {
              title: "Infer a build order",
              body: "Layers get sequenced the way a designer would actually construct the file: background, structure, imagery, type, finish.",
            },
            {
              title: "Replay it, narrated",
              body: "The reconstruction plays back on a timeline, describing each move as it happens — which shape is being drawn, which gradient, which effect and why. This is a replay of the real edit log, not a video, so you can pause at any frame and take over.",
            },
            {
              title: "Hand you the file",
              body: "The timeline ends in a live editor holding the actual layers, ready to modify and export.",
            },
          ]}
          requires={[
            "editor core (Phase 4)",
            "segmentation + depth + inpaint",
            "Yjs op-log replay",
            "layer classifier",
          ]}
        />
      </div>
    </div>
  );
}
