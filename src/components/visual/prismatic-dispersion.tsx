/**
 * PRISMATIC DISPERSION — the brand's core surface, built from how a prism
 * actually behaves.
 *
 * This replaces `PrismaticAurora`, which was never prismatic: four circles
 * blurred at 90-115px in four hues deliberately spread ~90deg apart. That is
 * an *aurora* — a diffuse atmospheric glow — which is physically the opposite
 * phenomenon from dispersion, and it is the reason the site read as a generic
 * gradient rather than as the thing the copy claims ("Light, Split.").
 *
 * SHAPE: one fan from a single source centred on the top edge (x=50%), not
 * two beams from the corners. Centring the source is also what makes
 * left/right balance automatic — the fan is mirror-symmetric across the
 * vertical centreline by construction.
 *
 * Two real flaws from the previous pass, fixed here:
 *   - The source was pushed so far above the box (`oy: -42%`) and the fan so
 *     wide (126deg) that by the time the rays entered the visible frame they
 *     had already opened out to nearly parallel, edge-to-edge diagonal
 *     stripes — no visible convergence anywhere, reading as "distributed
 *     freely" rather than "from a source." `oy` is now much closer (-14%)
 *     and the span much narrower (68deg), so the frame actually shows the
 *     fan opening, not the flattened-out tail end of one.
 *   - The colour stops were deliberately UNEVEN (red/orange/yellow
 *     compressed into ~20% of the fan, green/cyan alone given ~26%) on the
 *     theory that real dispersion isn't evenly spaced. In practice, at this
 *     fan's geometry that meant green/cyan visually swallowed most of the
 *     frame and red/violet were reduced to slivers — "two or three colours,"
 *     not a rainbow. Stops are now close to evenly spaced; reading as
 *     obviously multi-coloured matters more here than physical accuracy.
 *   Also: the second caustic layer used to reverse the colour order
 *   (`flip`), so where it screened over the first layer it blended two
 *   DIFFERENT hues into a muddier third colour instead of brightening the
 *   same one. Both layers now share the same order — overlap reinforces a
 *   ray's own colour instead of mixing it toward grey.
 *
 * Other rules, taken from photographic reference:
 *   - BLACK OWNS THE FRAME. Colour is an event against darkness, never a
 *     wash — hence the filament masks: most of this element is transparent
 *     by construction, not merely dim.
 *   - COLOUR EMERGES FROM A HOT WHITE CORE. White light in, spectrum out.
 *   - THE SOURCE READS AS A REGION, NOT A DOT. The hot-core layer is blurred
 *     and its own mask fades before the very top edge, so there is a bright
 *     area to converge toward without a hard clip-art vertex.
 *   - FILAMENTS ARE IRREGULAR. A dense fine layer plus a sparse brighter
 *     layer at a non-harmonic period, so individual rays stand out the way
 *     real diffraction does, rather than reading as one uniform comb.
 *   - CHROME IS ACHROMATIC. Nothing here tints the metal; chrome *makes*
 *     colour, it doesn't carry it.
 *
 * GEOMETRY IS SIZED OFF THE CONTAINER'S WIDTH, NOT ITS BOX. `conic-gradient`
 * degrees are only true angles in a square element — in a non-square one
 * they stretch per-axis with the box, so the same numbers produce a visibly
 * different shape in a short section than a tall one. The fan is therefore
 * rendered inside a square sized to 100% of the container's WIDTH (height
 * auto-follows via `aspect-ratio: 1`), anchored top-left and left to
 * overflow the bottom of short sections — clipped by the root's
 * `overflow-hidden`, same as when this was `inset-0`. The practical effect:
 * the same numbers produce the same absolute-pixel geometry in the ~900px
 * hero and the ~450px close section alike, instead of each section silently
 * reinterpreting them.
 *
 * PERF: cheaper than what it replaces. `PrismaticAurora` painted five
 * elements through 52-115px blurs — the most expensive filter there is —
 * re-rasterised on every drift keyframe. This paints static gradients once
 * and animates only `transform: rotate()` about the source point, which is
 * GPU-composited and never repaints the texture. Two soft blurs total. No
 * canvas, no rAF, no pointer listeners, no WebGL. `prefers-reduced-motion` is
 * honoured by the blanket rule in globals.css.
 */

/**
 * The dispersion ramp, red -> violet. Values are frozen copies of the nine
 * `SPECTRUM` bands and are NOT imported from `src/lib/critique/spectrum.ts`,
 * for the same reason `--aurora-*` was decoupled from `--spectral-*`
 * (globals.css): this is an approved, load-bearing background, and it must
 * not silently repaint because a critique dimension was renamed or dropped.
 *
 * `at` is a percentage across the fan's width — close to evenly spaced. See
 * the file-level doc comment for why an earlier, deliberately uneven
 * version was reverted: it read as two or three colours, not a rainbow.
 */
const DISPERSION = [
  { color: "oklch(0.66 0.22 15)", at: 0 }, // red
  { color: "oklch(0.75 0.17 55)", at: 12.5 }, // orange
  { color: "oklch(0.85 0.16 95)", at: 25 }, // yellow
  { color: "oklch(0.75 0.18 130)", at: 37.5 }, // yellow-green
  { color: "oklch(0.78 0.17 165)", at: 50 }, // green
  { color: "oklch(0.75 0.15 205)", at: 62.5 }, // cyan
  { color: "oklch(0.69 0.18 235)", at: 75 }, // azure
  { color: "oklch(0.62 0.2 265)", at: 87.5 }, // blue
  { color: "oklch(0.62 0.22 295)", at: 100 }, // violet
] as const;

/** Transparent shoulder at each edge of the fan, so it fades in rather than
 *  starting on a hard chromatic cut. Degrees. */
const SHOULDER = 5;

/** The one fan this file specifies — centred on the top edge, close enough
 *  to the frame that the convergence is visible, narrow enough that it
 *  reads as a fan opening rather than parallel stripes. */
const ORIGIN_X = "50%";
const ORIGIN_Y = "-14%";
const FAN_SPAN = 100;
const FAN_FROM = 180 - FAN_SPAN / 2;

function fanGradient() {
  const usable = FAN_SPAN - SHOULDER * 2;
  const stops = DISPERSION.map(({ color, at }) => ({
    color,
    deg: SHOULDER + (at / 100) * usable,
  }))
    .map(({ color, deg }) => `${color} ${deg.toFixed(2)}deg`)
    .join(", ");
  return `conic-gradient(from ${FAN_FROM}deg at ${ORIGIN_X} ${ORIGIN_Y}, transparent 0deg, ${stops}, transparent ${FAN_SPAN}deg, transparent 360deg)`;
}

/**
 * The filament mask — what turns a smooth wedge into discrete rays. The
 * dark-dominant duty cycle (~64%) is what keeps black owning the frame.
 */
function filamentMask(ox: string, oy: string, period: number, width: number) {
  return `repeating-conic-gradient(from ${FAN_FROM}deg at ${ox} ${oy}, rgba(0,0,0,0) 0deg, rgba(0,0,0,1) ${(width * 0.18).toFixed(3)}deg, rgba(0,0,0,1) ${(width * 0.82).toFixed(3)}deg, rgba(0,0,0,0) ${width.toFixed(3)}deg, rgba(0,0,0,0) ${period.toFixed(3)}deg)`;
}

/**
 * Distance falloff. Elongated well past the box so light runs off the
 * bottom edge of a tall section instead of fading out mid-frame and leaving
 * a dead black lower half.
 */
const FALLOFF_MASK = `radial-gradient(190% 175% at ${ORIGIN_X} ${ORIGIN_Y}, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 4%, rgba(0,0,0,1) 13%, rgba(0,0,0,0.9) 40%, rgba(0,0,0,0.55) 66%, rgba(0,0,0,0.18) 88%, rgba(0,0,0,0) 100%)`;

/**
 * Same shape, steeper drop. The hero is tall enough (~900px) that the
 * default mask above keeps the rays near-full-strength (0.9) more than
 * halfway down it — fine for the shorter close/auth surfaces, too much
 * presence for the hero, which needs its lower half to read as receding
 * into the dark rather than staying lit at roughly hero-top brightness.
 * The near-source plateau (0-13%) is unchanged — the rays still arrive at
 * full strength — the fade past it is simply pulled earlier and steeper, so
 * the second half of the hero reads as the light dissolving into darkness
 * rather than being cut off. Hero only — see `deepFade` below.
 */
const FALLOFF_MASK_DEEP = `radial-gradient(190% 175% at ${ORIGIN_X} ${ORIGIN_Y}, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 4%, rgba(0,0,0,1) 13%, rgba(0,0,0,0.78) 28%, rgba(0,0,0,0.4) 46%, rgba(0,0,0,0.12) 66%, rgba(0,0,0,0) 82%)`;

export function PrismaticDispersion({
  className = "",
  /** Overall brightness. The close/auth surfaces run dimmer than the hero. */
  intensity = 1,
  /** Swaps in `FALLOFF_MASK_DEEP` — the rays fade to black sooner and more
   *  steeply going down. Hero only; the close/auth surfaces are short enough
   *  that the default falloff already reads as complete by their own bottom
   *  edge, so there's nothing for a steeper curve to fix there. */
  deepFade = false,
}: {
  className?: string;
  intensity?: number;
  deepFade?: boolean;
}) {
  const falloff = deepFade ? FALLOFF_MASK_DEEP : FALLOFF_MASK;
  // Second caustic origin, offset a fraction from the first. Real crossing
  // caustics come from two slightly different facets — this is what keeps
  // the fan from reading as one flat printed gradient with a comb over it.
  // Close to the primary origin, not a separate source.
  const bx = "50.6%";
  const by = "-16%";
  const fan = fanGradient();

  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      {/* The square: width 100% of the container, height auto-set to match
          via aspect-ratio — see the file doc comment. Anchored top-left; any
          excess below a short container is trimmed by this element's own
          overflow-hidden above. */}
      <div
        className="absolute left-0 top-0 w-full"
        style={{
          aspectRatio: "1 / 1",
          opacity: intensity,
          maskImage: falloff,
          WebkitMaskImage: falloff,
        }}
      >
        {/* Dense caustic set. */}
        <div
          className="absolute inset-0"
          style={{
            background: fan,
            maskImage: filamentMask(ORIGIN_X, ORIGIN_Y, 1.15, 0.42),
            WebkitMaskImage: filamentMask(ORIGIN_X, ORIGIN_Y, 1.15, 0.42),
            transformOrigin: `${ORIGIN_X} ${ORIGIN_Y}`,
            animation: "dispersion-sway-a 21s ease-in-out infinite",
            opacity: 0.68,
            willChange: "transform",
          }}
        />
        {/* Sparse, brighter set — the standout rays, from a slightly
            different origin — see `bx`/`by` above. Same colour order as the
            first layer (not flipped) so where it screens over a fine
            filament, it brightens that ray's own hue instead of blending in
            a different one. */}
        <div
          className="absolute inset-0"
          style={{
            background: fan,
            maskImage: filamentMask(bx, by, 4.4, 0.55),
            WebkitMaskImage: filamentMask(bx, by, 4.4, 0.55),
            transformOrigin: `${bx} ${by}`,
            animation: "dispersion-sway-b 27s ease-in-out infinite",
            mixBlendMode: "screen",
            opacity: 0.6,
            willChange: "transform",
          }}
        />
        {/* The broad wedge the sharp caustics sit on. Without it the rays
            read as a barcode; the references always have a soft dispersed
            body underneath the sharp lines. */}
        <div className="absolute inset-0" style={{ background: fan, filter: "blur(48px)", opacity: 0.24 }} />
        {/* The hot core — colour has to come out of white, or the fan reads
            as painted on rather than split. Achromatic. Its own mask fades
            out before the very top edge, so it reads as a bright region the
            rays converge toward, not a hard point. */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(closest-side circle at ${ORIGIN_X} ${ORIGIN_Y}, oklch(0.99 0.004 240 / 0.95) 0%, oklch(0.99 0.004 240 / 0.32) 40%, transparent 72%)`,
            maskImage: `radial-gradient(30% 26% at ${ORIGIN_X} 0%, rgba(0,0,0,1), rgba(0,0,0,0) 100%)`,
            WebkitMaskImage: `radial-gradient(30% 26% at ${ORIGIN_X} 0%, rgba(0,0,0,1), rgba(0,0,0,0) 100%)`,
            filter: "blur(24px)",
            animation: "dispersion-breathe 11s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
