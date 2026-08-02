import { Wrench } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { Blueprint } from "@/components/studio/blueprint";
import { PrismPanel } from "@/components/brand/prism";
import { ToolQaPanel } from "@/components/studio/tool-qa-panel";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";

const MODULE = MODULES.find((m) => m.slug === "tools")!;

/** Tools to cover, grouped by how their knowledge can actually be kept current. */
const COVERAGE = [
  {
    group: "Official machine-readable sources",
    note: "These publish changelogs or developer APIs, so their knowledge can be kept genuinely current.",
    items: ["Figma", "Photoshop", "Illustrator", "After Effects", "InDesign", "Premiere"],
  },
  {
    group: "Documented, manually tracked",
    note: "Public help centres and release notes; ingested on a schedule.",
    items: ["Blender", "Canva", "Affinity Designer", "Rive", "Spline", "Framer"],
  },
  {
    group: "Fast-moving AI tools",
    note: "These change weekly, so screenshot grounding matters more here than any stored answer.",
    items: ["Magnific", "PhotoRoom", "Higgsfield", "Envato", "Runway", "Krea"],
  },
  {
    group: "Emerging & lesser-known",
    note: "Newer or niche tools worth knowing about — coverage here is thinner by nature and goes stale fastest.",
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

export default function ToolsPage() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<Wrench className="size-4" aria-hidden />} />

        <Blueprint
          dimension={MODULE.dimension}
          steps={[
            {
              title: "Ingest what vendors actually publish",
              body: "Figma exposes REST and plugin API changelogs; Adobe publishes UXP docs and release notes. Those are real, machine-readable sources and they get pulled on a schedule with a version stamp.",
            },
            {
              title: "Ground the rest in your screen",
              body: "No vendor publishes a map of where every menu item sits, and hand-maintaining one across every version is a treadmill nobody wins. So when you ask where something is, you can share a screenshot and get the control pointed at in your build — which works on versions nobody indexed.",
            },
            {
              title: "Say when it is unsure",
              body: "Every answer carries the version it was verified against and the date. If that is stale, the answer says so instead of confidently sending you to a menu that moved.",
            },
          ]}
          requires={["changelog ingestion", "screenshot grounding", "desktop capture (Tauri)"]}
        >
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
        </Blueprint>

        <div className="mt-6 space-y-3">
          <ToolQaPanel />
          <p className="px-1 text-[11.5px] leading-relaxed text-foreground/45">
            Tool landscape changes fast — verify anything version- or pricing-specific.
          </p>
        </div>
      </div>
    </div>
  );
}
