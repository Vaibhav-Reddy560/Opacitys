import { Suspense } from "react";
import { Compass } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { OriginalityForm } from "@/components/originality/originality-form";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "originality")!;

// OriginalityForm reads useSearchParams() (to bootstrap from a library
// "Check originality" link), which Next requires a Suspense boundary for.
export default function OriginalityPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<Compass className="size-4" aria-hidden />} />
        <Suspense fallback={null}>
          <OriginalityForm />
        </Suspense>
      </div>
    </div>
  );
}
