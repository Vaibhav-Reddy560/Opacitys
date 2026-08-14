"use client";

import Image from "next/image";
// Only used by the prismatic-sweep block below, currently disabled — see
// that block's comment.
// import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

interface TitleImageProps {
  width: number;
  height: number;
  className?: string;
  /** Which asset loads, not just the sweep band (see the doc comment) —
   *  "hero" is the landing page's big wordmark only. Everything else
   *  (nav, footer, auth shell, studio sidebar) is "compact". */
  size?: "hero" | "compact";
  /** Set on above-the-fold usages (hero, auth shell) — this is the LCP image there. */
  priority?: boolean;
}

/**
 * The title art. Two different source images now, not one asset at two
 * sizes:
 *   - Title_Image.webp — the landing hero only (`size="hero"`). Original
 *     letter-spacing; at hero scale (up to lg:max-w-2xl) it doesn't need
 *     any help reading clearly.
 *   - Title_widened.webp — everywhere else (`size="compact"`, the default):
 *     nav, footer, the auth shell, the studio sidebar. Same wordmark, wider
 *     tracking (added at the source, not via CSS letter-spacing on a raster
 *     image, which would just look smudged) — at the 24-36px heights these
 *     sites actually render at, the original's tighter spacing crowded the
 *     glyphs together. Sourced from Title_widened.png (3670x484, 1.7MB),
 *     downscaled to 1200px wide / ~70KB, same pipeline as the original.
 *
 * A raster image can't run the WebGL thin-film shader PrismaticChrome
 * uses, so on the hero the same idea — iridescence confined to a moving
 * highlight, not a flat rainbow wash — is reproduced in CSS: a band of the
 * app's real spectrum gradient travels across the glyphs on a zig-zag path,
 * masked to the image's own alpha so it only lights the letterforms. This
 * sweep runs on its own clock, unaffected by hover.
 *
 * The original hero PNG was originally 14732x2192 (32.3MP, 26.7MiB) served
 * `unoptimized` — the LCP asset on every page that renders it, at up to
 * ~768 CSS px. Downscaled once (scripts/, not checked in — see git history)
 * into two files actually sized for how they're used:
 *   - Title_Image.webp (2400px wide, ~190KB) — the visible glyphs, now run
 *     through next/image so it's optimized further per breakpoint.
 *   - Title_Image_mask.webp (1200px, lossless, ~170KB) — alpha-only content
 *     for the CSS mask below, which next/image can never touch since
 *     mask-image isn't part of the <img> pipeline. Lossless because mask
 *     edges are exactly where lossy artifacts would show through the sweep.
 *
 * Hover is currently a scale + low-chroma neutral glow. An earlier version
 * hue-rotated the whole image on hover (`prismatic-shimmer` in globals.css,
 * kept there commented out, not deleted) — parked, not rejected outright,
 * pending a decision on whether to bring it back.
 */
export function TitleImage({
  width,
  height,
  className = "h-auto w-auto",
  size = "compact",
  priority = false,
}: TitleImageProps) {
  // Only used by the prismatic-sweep block below, currently disabled.
  // const sweepOpacity = size === "hero" ? 0.8 : 0.55;
  // const sweepDuration = size === "hero" ? "9s" : "10s";
  // const bandWidth = size === "hero" ? "260% 260%" : "220% 220%";

  return (
    <div className="group relative inline-block shrink-0">
      <Image
        src={size === "hero" ? "/Title_Image.webp" : "/Title_widened.webp"}
        alt="Opacitys"
        width={width}
        height={height}
        className={`${className} relative`}
        priority={priority}
      />
      {/* Prismatic sweep disabled at user's request (2026-08-12) — parked,
          not removed, while the wordmark is judged against the new
          PrismaticDispersion backdrop on its own. Uncomment to restore.
      {size === "hero" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-color-dodge"
          style={{
            opacity: sweepOpacity,
            WebkitMaskImage: "url(/Title_Image_mask.webp)",
            maskImage: "url(/Title_Image_mask.webp)",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            background: `linear-gradient(100deg, transparent 0%, transparent 38%, ${SPECTRUM_GRADIENT} 50%, transparent 62%, transparent 100%)`,
            backgroundSize: bandWidth,
            animation: `prismatic-sweep ${sweepDuration} ease-in-out infinite`,
          }}
        />
      )}
      */}
    </div>
  );
}
