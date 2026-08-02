import type { ReactNode } from "react";
import { PrismIcon, PrismRule } from "@/components/brand/prism";
import { STATUS_LABEL, type ModuleDef } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { Dimension } from "@/lib/critique/types";

/**
 * Standard module page header. Carries the module's spectral accent and, when
 * the module is not yet fully wired, says so plainly in the header rather than
 * letting the page imply capability it does not have.
 */
export function PageHeader({
  module: m,
  icon,
  children,
}: {
  module: ModuleDef;
  icon: ReactNode;
  children?: ReactNode;
}) {
  const accent = SPECTRUM[m.dimension as Dimension]?.color;

  return (
    <header className="mb-10">
      <div className="flex items-start gap-4">
        <PrismIcon accent={accent} size={46}>
          {icon}
        </PrismIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className="text-2xl tracking-tight"
              style={{ fontVariationSettings: '"wght" 550' }}
            >
              {m.name}
            </h1>
            {m.status !== "live" && (
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
                style={{
                  color: accent,
                  borderColor: `color-mix(in oklch, ${accent} 30%, transparent)`,
                  background: `color-mix(in oklch, ${accent} 10%, transparent)`,
                }}
              >
                {STATUS_LABEL[m.status]}
              </span>
            )}
          </div>
          <p className="mt-1 text-[14px] text-foreground/58">{m.tagline}</p>
        </div>
      </div>

      <div className="mt-6">
        <PrismRule />
      </div>

      <p className="text-pretty mt-6 max-w-2xl text-[14.5px] leading-relaxed text-foreground/65">
        {m.body}
      </p>

      {children}
    </header>
  );
}
