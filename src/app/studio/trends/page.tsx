import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { TrendsForm } from "@/components/trends/trends-form";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "trends")!;
const ACCENT = SPECTRUM.layout.color;

// Server shell — see the comment in studio/critique/page.tsx for why
// RecentStrip has to be composed here rather than inside the client form.
export default function TrendsPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<TrendingUp className="size-4" aria-hidden />} />
        <TrendsForm />
        <RecentStrip kind="trends" accent={ACCENT} />
      </div>
    </div>
  );
}
