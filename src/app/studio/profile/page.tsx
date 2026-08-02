import { Fingerprint, Link2 } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { PrismPanel, OpacityMeter, PrismIcon } from "@/components/brand/prism";
import { MODULES } from "@/lib/copy";
import { SPECTRUM, DIMENSION_ORDER } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "profile")!;
const ACCENT = SPECTRUM.typography.color;

const PORTFOLIO_TARGETS = [
  {
    name: "Behance",
    note: "Adobe restricted the public API to existing partners, so this connects your own account only.",
  },
  {
    name: "Dribbble",
    note: "OAuth v2 exposes your own shots and their stats — no competitor data.",
  },
];

export default function ProfilePage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Fingerprint className="size-4" aria-hidden />} />

        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Learn your style from your work",
              body: "Every design you bring in adds to a fingerprint — the palettes you reach for, the type you trust, the structures you repeat. It is built from your uploads, so it describes what you actually do rather than what you say you do.",
            },
            {
              title: "Track your skills honestly",
              body: "Techniques you have used, tools you work in, and the gaps. This feeds Route, so the plans it gives you stay inside what you can actually execute — or stretch you deliberately.",
            },
            {
              title: "Connect your portfolio",
              body: "Your own Behance and Dribbble accounts via OAuth, so views and reactions land next to the work rather than in another tab.",
            },
            {
              title: "Keep the receipts",
              body: "A record of your direction over time — dated, with the originality distance for each piece. That is what answers somebody calling your work a template.",
            },
          ]}
          requires={["auth", "style embeddings", "Behance / Dribbble OAuth"]}
        >
          <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              Your fingerprint
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/58">
              This fills in as you use the studio. Nothing here is invented — with
              no work uploaded yet, every dimension sits at zero.
            </p>

            <div className="mt-6 space-y-3">
              {DIMENSION_ORDER.map((dim) => (
                <div key={dim} className="flex items-center gap-3">
                  <span className="w-[88px] shrink-0 text-[12px] text-foreground/62">
                    {SPECTRUM[dim].label}
                  </span>
                  <OpacityMeter value={0} accent={SPECTRUM[dim].color} className="flex-1" />
                </div>
              ))}
            </div>
          </PrismPanel>

          <PrismPanel className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              Portfolio connections
            </h2>
            <ul className="mt-5 space-y-3">
              {PORTFOLIO_TARGETS.map((p) => (
                <li
                  key={p.name}
                  className="flex items-start gap-3.5 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"
                >
                  <PrismIcon size={34} accent={ACCENT}>
                    <Link2 className="size-3.5" aria-hidden />
                  </PrismIcon>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[13.5px]"
                      style={{ fontVariationSettings: '"wght" 550' }}
                    >
                      {p.name}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/55">
                      {p.note}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-foreground/50">
                    Not connected
                  </span>
                </li>
              ))}
            </ul>
          </PrismPanel>
        </Blueprint>
      </div>
    </div>
  );
}
