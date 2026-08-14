import { Wrench } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel } from "@/components/brand/prism";
import { ToolsForm } from "@/components/tools/tools-form";
import { RecentStrip } from "@/components/library/recent-strip";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "tools")!;

/** Tools covered, grouped by how fast their landscape actually moves. */
const COVERAGE = [
  {
    group: "Official machine-readable sources",
    note: "These publish changelogs or developer APIs, so a research pass finds genuinely current answers here.",
    items: ["Figma", "Photoshop", "Illustrator", "After Effects", "InDesign", "Premiere"],
  },
  {
    group: "Documented, well-indexed",
    note: "Public help centres and release notes that search finds reliably.",
    items: ["Blender", "Canva", "Affinity Designer", "Rive", "Spline", "Framer"],
  },
  {
    group: "Fast-moving AI tools",
    note: "These change weekly, so a screenshot is often more reliable than any search result.",
    items: ["Magnific", "PhotoRoom", "Higgsfield", "Envato", "Runway", "Krea"],
  },
  {
    group: "Emerging & lesser-known",
    note: "Newer or niche tools worth knowing about — coverage here is thinner and depends on what's indexed at all.",
    items: [
      "Modyfi — GPU-native, real-time editing in the browser",
      "Kittl — vector design built around print-on-demand and merch",
      "Uizard — turns sketches or prompts into editable UI mockups",
      "Visily — AI wireframing from screenshots or plain descriptions",
      "Recraft — AI vector and raster generation with editable output",
      "Relume — sitemap-and-wireframe generation that exports to Webflow",
    ],
  },
];

// Server shell — see the comment in studio/critique/page.tsx for why
// RecentStrip has to be composed here rather than inside the client form.
export default function ToolsPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader module={MODULE} icon={<Wrench className="size-4" aria-hidden />} />

        <ToolsForm />
        <RecentStrip kind="tools" accent={SPECTRUM.balance.color} />

        <div className="mt-6">
          <PrismPanel accent={SPECTRUM.balance.color} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
              Coverage plan
            </h2>
            <div className="mt-6 space-y-6">
              {COVERAGE.map((g) => (
                <div key={g.group}>
                  <p
                    className="text-[13.5px]"
                    style={{ fontVariationSettings: '"wght" 550' }}
                  >
                    {g.group}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/55">
                    {g.note}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {g.items.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 text-[11.5px] text-foreground/62"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </PrismPanel>
        </div>

        <p className="mt-5 px-1 text-[11.5px] leading-relaxed text-foreground/45">
          Tool landscape changes fast — verify anything version- or pricing-specific.
        </p>
      </div>
    </div>
  );
}
