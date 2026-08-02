import type { ReactNode } from "react";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { Dimension } from "@/lib/critique/types";

/**
 * Renders a module's planned pipeline and requirements.
 *
 * Deliberately does NOT render sample outputs dressed up as results. A page
 * showing invented trend data or a fabricated critique would misrepresent what
 * the app can currently do — which is exactly the failure mode this product
 * exists to fix. Instead each step states what it will do and what it depends
 * on, so the interface is real and the status is honest.
 */
export function Blueprint({
  dimension,
  steps,
  requires,
  children,
}: {
  dimension: string;
  steps: { title: string; body: string }[];
  requires?: string[];
  children?: ReactNode;
}) {
  const accent = SPECTRUM[dimension as Dimension]?.color;

  return (
    <div className="space-y-6">
      {children}

      <PrismPanel accent={accent} className="p-6 sm:p-7">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          How this will work
        </h2>

        <ol className="mt-6 space-y-5">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10.5px]"
                style={{
                  color: accent,
                  borderColor: `color-mix(in oklch, ${accent} 32%, transparent)`,
                  background: `color-mix(in oklch, ${accent} 9%, transparent)`,
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p
                  className="text-[14px] tracking-tight"
                  style={{ fontVariationSettings: '"wght" 550' }}
                >
                  {s.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/58">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {requires && requires.length > 0 && (
          <div className="mt-7 border-t border-white/[0.07] pt-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">
              Waiting on
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {requires.map((r) => (
                <li
                  key={r}
                  className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-foreground/58"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PrismPanel>
    </div>
  );
}
