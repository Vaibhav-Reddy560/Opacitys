import { Scale } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel } from "@/components/brand/prism";
import { RightsQaPanel } from "@/components/studio/rights-qa-panel";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "rights")!;

/**
 * Durable, non-jurisdiction-specific concepts — these don't shift by country
 * or go stale the way a specific statute would, so they're static rather
 * than routed through the model.
 */
const GENERAL_PRINCIPLES = [
  {
    title: "Public domain",
    body: "Work whose copyright has expired, was never claimed, or was explicitly released (CC0) — free to use commercially with no license, anywhere. Nothing else on this list is that simple.",
  },
  {
    title: "“Free to download” isn’t “free to use commercially”",
    body: "Most free stock and font sites license for personal or limited use by default. Commercial use — selling merchandise, client work, a paid product — usually needs a separate commercial license, even when the download itself cost nothing.",
  },
  {
    title: "What a commercial license typically covers",
    body: "Scope (print, digital, merchandise), seat/user count, and whether it's exclusive. A license for “web use” doesn't automatically extend to packaging or merch — read the scope, not just the price.",
  },
  {
    title: "Work-for-hire basics",
    body: "In most places, work you create as an employee belongs to your employer by default. Freelance work usually belongs to you unless the contract explicitly assigns it — the contract is what decides this, not the fact that you were paid.",
  },
];

export default function RightsPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Scale className="size-4" aria-hidden />} />

        <div className="space-y-6">
          <PrismPanel accent={SPECTRUM.balance.color} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              General principles
            </h2>
            <div className="mt-6 space-y-5">
              {GENERAL_PRINCIPLES.map((p) => (
                <div key={p.title}>
                  <p className="text-[13.5px]" style={{ fontVariationSettings: '"wght" 550' }}>
                    {p.title}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/58">{p.body}</p>
                </div>
              ))}
            </div>
          </PrismPanel>

          <RightsQaPanel />
          <RecentStrip kind="rights" accent={SPECTRUM.balance.color} />
        </div>
      </div>
    </div>
  );
}
