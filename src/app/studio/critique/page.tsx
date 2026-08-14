import { ScanEye } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { CritiqueForm } from "@/components/critique/critique-form";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "critique")!;

export default function CritiquePage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<ScanEye className="size-4" aria-hidden />} />
        <CritiqueForm />
      </div>
    </div>
  );
}
