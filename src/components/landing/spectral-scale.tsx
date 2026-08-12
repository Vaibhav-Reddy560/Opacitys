import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";

/**
 * The nine-dimension index. Third pass.
 *
 * The first version (bare text over a dot, floating on a hairline) broke at
 * wide viewports — `justify-between` stretched nine tiny items across the
 * full measure into huge dead gaps. The second version fixed the spacing by
 * borrowing the app's own chip language (`FindingCard`'s severity pill,
 * `MODULES`' status badge — a `color-mix`-tinted rounded pill per item), but
 * that was still, structurally, a chip: nine identical small rounded,
 * bordered, tinted widgets in a row is the textbook definition of a "tag
 * list" or "filter chips" pattern, regardless of what colours fill it. That
 * silhouette reads as generic SaaS UI no matter how it's recoloured.
 *
 * This is a different shape, not a restyled version of the same one: one
 * continuous strip, one rounded rectangle, divided into nine solid colour
 * bands in true spectral order — a segmented spectrum bar, closer to a
 * Pantone swatch strip or a spectrometer's own read-out than to a chip row.
 * It's also a more literal statement of the product's own premise (a prism
 * splits light into a measured spectrum) than nine separate labelled dots
 * ever were. `grid-template-columns` keeps every band exactly equal —
 * uneven widths here would read as a bar chart, not a spectrum.
 *
 * A server component — nine static grid cells, nothing here needs the
 * client.
 */
export function SpectralScale() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/[0.08] sm:grid-cols-9">
        {DIMENSION_ORDER.map((d) => {
          const color = SPECTRUM[d].color;
          return (
            <div
              key={d}
              className="flex items-center justify-center px-2 py-3.5 text-center"
              style={{ background: `color-mix(in oklch, ${color} 14%, transparent)` }}
            >
              <span
                className="text-[10px] uppercase tracking-[0.09em] whitespace-nowrap"
                style={{ color: `color-mix(in oklch, ${color} 78%, white 22%)` }}
              >
                {SPECTRUM[d].label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
