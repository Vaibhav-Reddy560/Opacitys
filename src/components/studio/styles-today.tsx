import type { DailyStyleItem } from "@/lib/digest/read";
import { META_ACCENT } from "@/lib/critique/spectrum";

/**
 * Fills the sidebar's dead space below the module list (sidebar.tsx used to
 * let <nav> stretch with flex-1, leaving the remainder empty). No click
 * needed to mark this SEEN — studio/layout.tsx does that server-side the
 * moment it's rendered.
 *
 * Each description clamps to 2 lines; the full text is a pure-CSS hover
 * popup floating to the item's right, not an inline expand — an in-place
 * expand grows the sidebar's own content height, which either pushes the
 * fixed module list around or needs its own scroll container (tried both,
 * see git history: the module list moving at all was explicitly rejected).
 * A floating popup shows the full text without the module list — or even
 * this widget's own layout — ever having to move.
 */
export function StylesToday({ items, unseen }: { items: DailyStyleItem[]; unseen: boolean }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-4 border-t border-white/[0.07] pt-4">
      <div className="flex items-center gap-1.5 px-2.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Today&rsquo;s design trends</p>
        {unseen && (
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: META_ACCENT, boxShadow: `0 0 6px ${META_ACCENT}` }}
          />
        )}
      </div>
      <ul className="mt-2.5 space-y-2.5 px-2.5">
        {items.slice(0, 3).map((item) => (
          <li key={item.name} className="group relative">
            <p className="text-[12.5px] text-foreground/82" style={{ fontVariationSettings: '"wght" 550' }}>
              {item.name}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-foreground/50">{item.description}</p>

            <div
              role="tooltip"
              // Wider (w-80, not w-64) so long descriptions wrap into fewer
              // lines — directly shortens the popup, which is what was
              // actually getting cut off at the screen edge. Vertically
              // centered on the item (not top-0) so the extra height
              // splits both above and below instead of concentrating below,
              // and max-h + its own scroll is the hard guarantee: even a
              // still-too-long description scrolls inside the popup rather
              // than running off-screen with no way to read the rest.
              className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-40 max-h-80 w-80 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/[0.09] bg-background/95 p-3.5 text-[12px] leading-relaxed text-foreground/85 opacity-0 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-opacity duration-150 group-hover:opacity-100"
            >
              <p className="mb-1.5 text-[12.5px] text-foreground/95" style={{ fontVariationSettings: '"wght" 550' }}>
                {item.name}
              </p>
              {item.description}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
