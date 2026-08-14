import type { ReactNode } from "react";
import { PrismIcon, PrismRule } from "@/components/brand/prism";
import { STATUS_LABEL, type ModuleDef } from "@/lib/copy";
import { moduleAccent } from "@/lib/critique/spectrum";

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
  const accent = moduleAccent(m);

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

      {/* No max-w cap: this used to be max-w-2xl (672px), tuned for when the
          page container itself was max-w-3xl (768px) — at that width a
          672px paragraph already used most of the available line. Now that
          the container is wider (max-w-4xl, 896px+), the same fixed cap
          left a growing, increasingly obvious block of empty space to its
          right instead of wrapping to the width that's actually there. The
          container itself is still the real width constraint; this just
          stops double-capping inside it. */}
      <p className="text-pretty mt-6 text-[14.5px] leading-relaxed text-foreground/65">
        {m.body}
      </p>

      {children}
    </header>
  );
}
