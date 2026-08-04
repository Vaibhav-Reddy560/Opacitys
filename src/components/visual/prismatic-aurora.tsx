/**
 * Marketing-surface backdrop — dark, non-interactive, continuously live,
 * unambiguously prismatic. Drop-in replacement for `PrismaticChrome` (the
 * WebGL thin-film shader that read as dark oily chrome, not "rainbow") at
 * its three call sites: the hero, the closing CTA section, and the auth
 * shell. Same usage shape — `className="absolute inset-0 -z-20 h-full
 * w-full"` on the parent's `isolate`d, `overflow-hidden` section — nowhere
 * else. This is a LOCAL, per-section fill, not a page background: the flat
 * `--background` sections in between (how-it-works, frictions, spectrum,
 * studio) were solid dark by design and were never meant to change.
 *
 * Recipe: the validated "Aurora" pattern (Aceternity UI /
 * superdesign.dev/styles/aurora) — four well-separated spectrum hues plus a
 * blurred, slowly rotating conic-gradient ring, which is what reads as
 * genuinely prismatic rather than four soft blobs. The conic gradient MUST
 * interpolate `in oklch` — the sRGB default channel-lerp between four
 * widely-spaced saturated hues produces a muddy grey/brown wash across each
 * transition arc (this was shipped once and immediately visible as a bug).
 *
 * Pure CSS keyframes — no canvas, no rAF loop, no pointer listeners.
 * Non-interactivity is structural, and prefers-reduced-motion is honoured
 * for free by the blanket rule in globals.css.
 */
export function PrismaticAurora({
  className = "",
  compact = false,
}: {
  className?: string;
  /**
   * The four corner blobs carry fixed min-height/min-width floors sized for
   * a tall (~800px+) container like the hero or auth shell. Dropped into a
   * shorter section (e.g. the closing CTA), those same floors force the
   * blobs to occupy nearly the whole box, so they overlap heavily — and
   * since they paint in normal (non-blended) order, the later, warmer blobs
   * (spacing, originality) sit on top at full opacity and bury the cooler
   * ones underneath. The result reads as a duller, warm-skewed wash instead
   * of the same four-colour spread the hero shows. `compact` scales every
   * floor down (~58%) so the blobs stay spatially distinct in a shorter box
   * too, without changing how this looks in the tall usages.
   */
  compact?: boolean;
}) {
  return (
    <div aria-hidden className={`overflow-hidden ${className}`}>
      <div
        className={
          compact
            ? "absolute left-1/2 top-1/2 size-[130%] min-h-[520px] min-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            : "absolute left-1/2 top-1/2 size-[130%] min-h-[900px] min-w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        }
        style={{
          background: `conic-gradient(in oklch, from 0deg,
            var(--spectral-hierarchy),
            var(--spectral-typography),
            var(--spectral-spacing),
            var(--spectral-originality),
            var(--spectral-hierarchy))`,
          filter: compact ? "blur(52px) saturate(1.5)" : "blur(90px) saturate(1.5)",
          opacity: 0.55,
          animation: "aurora-ring-spin 16s linear infinite",
          willChange: "transform",
        }}
      />
      <div
        className={
          compact
            ? "absolute -left-[10%] top-[5%] size-[55%] min-h-[245px] min-w-[245px] rounded-full blur-[64px]"
            : "absolute -left-[10%] top-[5%] size-[55%] min-h-[420px] min-w-[420px] rounded-full blur-[110px]"
        }
        style={{
          background: "var(--spectral-hierarchy)",
          animation: "aurora-drift-a 8s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />
      <div
        className={
          compact
            ? "absolute -right-[8%] top-[18%] size-[50%] min-h-[220px] min-w-[220px] rounded-full blur-[61px]"
            : "absolute -right-[8%] top-[18%] size-[50%] min-h-[380px] min-w-[380px] rounded-full blur-[105px]"
        }
        style={{
          background: "var(--spectral-typography)",
          animation: "aurora-drift-b 10s ease-in-out infinite",
          animationDelay: "-3.5s",
          willChange: "transform, opacity",
        }}
      />
      <div
        className={
          compact
            ? "absolute bottom-[12%] left-[16%] size-[52%] min-h-[232px] min-w-[232px] rounded-full blur-[67px]"
            : "absolute bottom-[12%] left-[16%] size-[52%] min-h-[400px] min-w-[400px] rounded-full blur-[115px]"
        }
        style={{
          background: "var(--spectral-spacing)",
          animation: "aurora-drift-c 8.5s ease-in-out infinite",
          animationDelay: "-5.5s",
          willChange: "transform, opacity",
        }}
      />
      <div
        className={
          compact
            ? "absolute -bottom-[6%] right-[8%] size-[48%] min-h-[210px] min-w-[210px] rounded-full blur-[58px]"
            : "absolute -bottom-[6%] right-[8%] size-[48%] min-h-[360px] min-w-[360px] rounded-full blur-[100px]"
        }
        style={{
          background: "var(--spectral-originality)",
          animation: "aurora-drift-d 7s ease-in-out infinite",
          animationDelay: "-2s",
          willChange: "transform, opacity",
        }}
      />
    </div>
  );
}
