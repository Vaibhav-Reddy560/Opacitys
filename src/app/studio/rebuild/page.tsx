import { Layers } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { RebuildForm } from "@/components/rebuild/rebuild-form";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "rebuild")!;

export default function RebuildPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<Layers className="size-4" aria-hidden />} />
        <RebuildForm />
      </div>
    </div>
  );
}
