import { PrismaticDispersion } from "./prismatic-dispersion";

/**
 * The hero / CTA / auth-shell backdrop: `PrismaticDispersion` plus the scrim
 * that keeps content legible inside the beam.
 *
 * Replaces `AuroraBackdrop`, which wrapped `PrismaticAurora` — see
 * `prismatic-dispersion.tsx` for why that effect was the wrong physics for
 * this brand. The usage contract is unchanged: a Fragment, not a wrapping
 * div, because both children are positioned `absolute inset-0` against the
 * CALLER's section, which must carry `relative isolate overflow-hidden`.
 * A wrapper here would sit between them and that section without changing
 * anything (a `position: static` div is not a containing block), so there is
 * no reason to add a DOM node that was never there.
 *
 * A server component (no hooks, no "use client") so pulling it into
 * `page.tsx` doesn't force that file into the client bundle.
 *
 * SCRIM — two layers, and the split matters:
 *   - An ellipse of near-background over the middle, where the wordmark and
 *     copy sit. The rays pass *behind* the text instead of through it. Kept
 *     soft-edged and modest; too strong and it reads as a grey plate floating
 *     in the beam, which is the exact "stuffed component" failure mode.
 *   - A vertical ramp that lands the section on solid `--background` at the
 *     bottom edge, so the next section starts clean with no seam.
 *
 * The scrim colour is `--background`'s literal value. Do not swap it for a
 * neutral black: this base is a cool near-black (oklch 0.145 0.012 265) and a
 * true black scrim over it shows as a visible grey-blue halo.
 */
export function PrismaticBackdrop({
  /** Dims the whole effect. The hero runs at 1; shorter or more functional
   *  surfaces (the closing CTA, the sign-in shell) run lower so the dispersion
   *  stays an accent rather than the subject. */
  intensity = 1,
  /** Forwarded to `PrismaticDispersion` — see its own doc comment. Hero only. */
  deepFade = false,
}: {
  intensity?: number;
  deepFade?: boolean;
}) {
  return (
    <>
      <PrismaticDispersion
        className="absolute inset-0 -z-20 h-full w-full"
        intensity={intensity}
        deepFade={deepFade}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(58% 40% at 50% 46%, oklch(0.145 0.012 265 / 0.92) 0%, oklch(0.145 0.012 265 / 0.66) 52%, transparent 88%)",
            "linear-gradient(to bottom, oklch(0.145 0.012 265 / 0.28) 0%, transparent 26%, transparent 62%, oklch(0.145 0.012 265 / 0.72) 92%, oklch(0.145 0.012 265) 100%)",
          ].join(", "),
        }}
      />
    </>
  );
}
