import { ScanEye } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { CritiqueForm } from "@/components/critique/critique-form";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "critique")!;

// Server shell so RecentStrip (an async Server Component reading straight
// from the DB) can sit alongside CritiqueForm (the interactive upload/wait
// flow) — a Client Component can't import and render a Server Component
// directly, only receive one as a child/prop from a Server Component parent.
export default function CritiquePage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<ScanEye className="size-4" aria-hidden />} />
        <CritiqueForm />
        <RecentStrip kind="critique" accent={SPECTRUM.color.color} />
      </div>
    </div>
  );
}
