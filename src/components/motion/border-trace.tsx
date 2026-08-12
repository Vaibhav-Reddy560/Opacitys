import { DIMENSION_ORDER, SPECTRUM } from "@/lib/critique/spectrum";
import { cn } from "@/lib/utils";

/**
 * A short glowing segment that travels clockwise around a rectangle's own
 * edge — starting top-left, right along the top, down the right side, left
 * along the bottom, up the left side, back to start. Not `SpectralBorder`:
 * that component rotates a conic gradient about the box's CENTRE, which
 * only traces a ring on a square box — on a wide-and-short card like this
 * one it reads as a distorted rotating diamond, not a border. This instead
 * strokes an actual `<rect>` matching the card's own box and animates
 * `stroke-dashoffset` to slide a dash along that traced path, which is what
 * "a line moving around the edge" actually requires.
 *
 * `pathLength="100"` on the rect is what makes this correct at any size:
 * without it, `stroke-dasharray`/`stroke-dashoffset` are in the rect's own
 * user-space units, which for a percentage-sized rect scale with viewBox in
 * a way that doesn't match rendered pixels. With it, "100" always means
 * "one full lap" regardless of how tall the card ends up — no measuring the
 * card in JS, no ResizeObserver.
 *
 * A server component — pure SVG + a CSS keyframe (`border-trace-dash`,
 * globals.css), no hooks, so it doesn't pull `AuthShell`'s already-client
 * bundle any further.
 */
export function BorderTrace({
  className,
  /** Matches PrismPanel's `rounded-2xl` (--radius-2xl = --radius*1.8 =
   *  0.75rem*1.8 = 21.6px). Pass a different value if this ever wraps a
   *  panel with a different radius. */
  radius = 21.6,
  /** Seconds per full lap. */
  duration = 8,
  /** The dash's length, as a percent of the total perimeter — see
   *  `pathLength` above for why this is a plain percentage. */
  segment = 26,
}: {
  className?: string;
  radius?: number;
  duration?: number;
  segment?: number;
}) {
  return (
    <svg
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full overflow-visible", className)}
    >
      <defs>
        {/* objectBoundingBox (the default) is deliberate, not just the path
            simplest option: it ties the dash's colour to WHERE on the card
            it currently is, so the travelling light visibly shifts through
            the spectrum as it goes — the same nine-stop ramp every other
            spectral element on the site uses, not a separate palette. */}
        <linearGradient id="border-trace-gradient" x1="0" y1="0" x2="1" y2="1">
          {DIMENSION_ORDER.map((d, i) => (
            <stop
              key={d}
              offset={`${(i / (DIMENSION_ORDER.length - 1)) * 100}%`}
              stopColor={SPECTRUM[d].color}
            />
          ))}
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill="none"
        stroke="url(#border-trace-gradient)"
        strokeWidth={1.75}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${segment} ${100 - segment}`}
        style={{
          animation: `border-trace-dash ${duration}s linear infinite`,
          filter: "drop-shadow(0 0 5px oklch(0.92 0.03 250 / 0.85))",
        }}
      />
    </svg>
  );
}
