import { Aperture } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel } from "@/components/brand/prism";
import { IdentifyForm } from "@/components/identify/identify-form";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { STYLE_TAXONOMY } from "@/lib/identify/taxonomy";

const MODULE = MODULES.find((m) => m.slug === "identify")!;
const ACCENT = SPECTRUM.hierarchy.color;

// Server shell — see the comment in studio/critique/page.tsx for why
// RecentStrip has to be composed here rather than inside the client form.
export default function IdentifyPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<Aperture className="size-4" aria-hidden />} />

        <IdentifyForm />
        <RecentStrip kind="identify" accent={ACCENT} />

        <div className="mt-8">
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The vocabulary</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/58">
              The full taxonomy every read is scored against — {STYLE_TAXONOMY.length} styles, curated by hand
              rather than generated, so classification stays reproducible.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {STYLE_TAXONOMY.map((t) => (
                <li
                  key={t.slug}
                  title={t.tell}
                  className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-foreground/62"
                >
                  {t.name}
                </li>
              ))}
            </ul>
          </PrismPanel>
        </div>
      </div>
    </div>
  );
}
