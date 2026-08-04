"use client";

import Image from "next/image";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

interface TitleImageProps {
  width: number;
  height: number;
  className?: string;
  /** Sweep band is narrower at nav/footer scale, fuller in the hero. */
  size?: "hero" | "compact";
  /** Set on above-the-fold usages (hero, auth shell) — this is the LCP image there. */
  priority?: boolean;
}

/**
 * The title PNG (see /public/Title_Image.png — a pre-rendered prismatic
 * treatment of the wordmark, not generated here). A raster image can't run
 * the WebGL thin-film shader PrismaticChrome uses, so the same idea —
 * iridescence confined to a moving highlight, not a flat rainbow wash — is
 * reproduced in CSS: a band of the app's real spectrum gradient travels
 * across the glyphs on a zig-zag path, masked to the image's own alpha so
 * it only lights the letterforms. This sweep runs on its own clock,
 * unaffected by hover.
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
  const sweepOpacity = size === "hero" ? 0.8 : 0.55;
  const sweepDuration = size === "hero" ? "9s" : "10s";
  const bandWidth = size === "hero" ? "260% 260%" : "220% 220%";

  return (
    <div className="group relative inline-block shrink-0">
      <Image
        src="/Title_Image.png"
        alt="Opacitys"
        width={width}
        height={height}
        className={`${className} relative`}
        priority={priority}
        unoptimized
      />
      {size === "hero" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-color-dodge"
          style={{
            opacity: sweepOpacity,
            WebkitMaskImage: "url(/Title_Image.png)",
            maskImage: "url(/Title_Image.png)",
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
    </div>
  );
}
