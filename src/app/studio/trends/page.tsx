import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { TrendsForm } from "@/components/trends/trends-form";
import { MODULES } from "@/lib/copy";

const MODULE = MODULES.find((m) => m.slug === "trends")!;

export default function TrendsPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<TrendingUp className="size-4" aria-hidden />} />
        <TrendsForm />
      </div>
    </div>
  );
}
