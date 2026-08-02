import Link from "next/link";
import {
  Aperture,
  Layers,
  ScanEye,
  TrendingUp,
  Route as RouteIcon,
  Wrench,
  MessagesSquare,
  Fingerprint,
  Compass,
  Scale,
  ArrowUpRight,
} from "lucide-react";
import { PrismIcon, PrismPanel, PrismRule, OpacityMeter } from "@/components/brand/prism";
import { MODULES, OPACITY_STAGES, STATUS_LABEL } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { Dimension } from "@/lib/critique/types";

const ICONS: Record<string, typeof Layers> = {
  critique: ScanEye,
  rebuild: Layers,
  identify: Aperture,
  trends: TrendingUp,
  workflow: RouteIcon,
  tools: Wrench,
  translate: MessagesSquare,
  originality: Compass,
  profile: Fingerprint,
  rights: Scale,
};

export default function StudioHome() {
  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <header className="mb-11">
        <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/52">
          The studio
        </p>
        <h1
          className="text-balance mt-4 max-w-2xl text-3xl leading-[1.14] tracking-tight sm:text-[2.5rem]"
          style={{ fontVariationSettings: '"wght" 500' }}
        >
          Where would you like to raise the opacity?
        </h1>
        <p className="text-pretty mt-4 max-w-xl text-[14.5px] leading-relaxed text-foreground/62">
          Ten rooms, one idea: take something faint and bring it up until it is
          fully there. Start anywhere — you do not need a finished file.
        </p>
      </header>

      {/* The metaphor, stated once, as a scale */}
      <section className="mb-12">
        <PrismPanel className="p-6 sm:p-8">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
            How a design develops
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {OPACITY_STAGES.map((s) => (
              <div key={s.value}>
                <OpacityMeter value={s.value} />
                <p
                  className="mt-3 text-[13.5px]"
                  style={{ fontVariationSettings: '"wght" 550' }}
                >
                  {s.label}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/55">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </PrismPanel>
      </section>

      <div className="mb-6 flex items-center gap-4">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          Rooms
        </h2>
        <PrismRule className="flex-1" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = ICONS[m.slug] ?? Layers;
          const accent = SPECTRUM[m.dimension as Dimension]?.color;
          return (
            <Link key={m.slug} href={m.href} className="group block">
              <PrismPanel accent={accent} className="h-full p-5">
                <div className="flex items-start gap-3.5">
                  <PrismIcon accent={accent} size={38}>
                    <Icon className="size-4" aria-hidden />
                  </PrismIcon>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className="text-[15px] tracking-tight"
                        style={{ fontVariationSettings: '"wght" 550' }}
                      >
                        {m.name}
                      </h3>
                      <ArrowUpRight className="size-3.5 shrink-0 text-foreground/50 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      {m.status !== "live" && (
                        <span className="ml-auto rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-foreground/50">
                          {STATUS_LABEL[m.status]}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12.5px] text-foreground/58">{m.tagline}</p>
                  </div>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-foreground/55">
                  {m.body}
                </p>
              </PrismPanel>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
