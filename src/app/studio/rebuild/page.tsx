import { Layers } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { RebuildForm } from "@/components/rebuild/rebuild-form";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "rebuild")!;

// Server shell so RecentStrip (an async Server Component reading straight
// from the DB) can sit alongside RebuildForm (the interactive upload/wait
// flow) — same split as critique/page.tsx.
export default function RebuildPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Layers className="size-4" aria-hidden />} />
        <RebuildForm />
        <RecentStrip kind="rebuild" accent={SPECTRUM.typography.color} />
      </div>
    </div>
  );
}
