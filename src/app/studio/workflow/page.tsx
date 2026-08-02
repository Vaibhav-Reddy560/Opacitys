import { Route as RouteIcon } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "workflow")!;

export default function WorkflowPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<RouteIcon className="size-4" aria-hidden />} />
        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Take stock of what you have",
              body: "The brief and its constraints, the assets you were given, the software you actually own, and an honest read of which techniques you are comfortable with. The route is only useful if it is a route you can walk.",
            },
            {
              title: "Propose directions worth trying",
              body: "Several distinct approaches rather than one, including at least one you probably have not attempted — with the reason it might suit this brief.",
            },
            {
              title: "Sequence it",
              body: "An ordered plan where every step names the tool, the feature inside that tool, and what finished looks like for that step.",
            },
            {
              title: "Keep it honest about effort",
              body: "Each step carries a rough time and a difficulty relative to your recorded skill level, so you can see where the week actually goes before you commit to it.",
            },
          ]}
          requires={["tool knowledge base", "skill profile", "brief parsing"]}
        />
      </div>
    </div>
  );
}
