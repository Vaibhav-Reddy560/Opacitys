"use client";

import { useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Dimension, Severity } from "@/lib/critique/types";
import { SPECTRUM } from "@/lib/critique/spectrum";

export interface AnnotatedFinding {
  id: string;
  dimension: Dimension;
  severity: Severity;
  bbox: [number, number, number, number]; // source-image pixel space
  number: number;
}

interface AnnotatedCanvasProps {
  imageUrl: string;
  imageWidth: number;
  findings: AnnotatedFinding[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * The source image with coordinate-accurate finding overlays.
 *
 * Boxes are stored in source-image pixel space and rescaled to the rendered
 * size, so the "pinpoint accuracy" claim holds at any viewport. Each box is
 * tinted by its dimension's spectral band, so colour alone tells you what
 * kind of problem it is before you read anything.
 */
export function AnnotatedCanvas({
  imageUrl,
  imageWidth,
  findings,
  activeId,
  onSelect,
}: AnnotatedCanvasProps) {
  const [renderedWidth, setRenderedWidth] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const reduce = useReducedMotion();

  const scale = renderedWidth && imageWidth > 0 ? renderedWidth / imageWidth : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40">
      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded Blob URLs, not build-time assets */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Design under analysis"
        className="block w-full select-none"
        draggable={false}
        onLoad={(e) => setRenderedWidth(e.currentTarget.clientWidth)}
      />

      {scale > 0 &&
        findings.map((f, i) => {
          const [x, y, w, h] = f.bbox;
          const color = SPECTRUM[f.dimension]?.color ?? "oklch(0.8 0 0)";
          const isActive = activeId === f.id;
          const dimmed = activeId !== null && !isActive;

          const style: CSSProperties = {
            left: x * scale,
            top: y * scale,
            width: w * scale,
            height: h * scale,
            borderColor: color,
            boxShadow: isActive
              ? `0 0 0 1px ${color}, 0 0 22px -2px ${color}`
              : `0 0 12px -4px ${color}`,
          };

          // Flip the label below the box when there isn't room above it,
          // and right-align it when the box sits close to the canvas's
          // right edge — a left-anchored label on a box near that edge
          // extends past the container and gets clipped by its own
          // overflow-hidden, which is what was happening here.
          const labelBelow = y * scale < 26;
          const labelRight = renderedWidth ? renderedWidth - (x + w) * scale < 90 : false;
          const dimensionLabel = SPECTRUM[f.dimension]?.label ?? f.dimension;

          return (
            <motion.button
              key={f.id}
              type="button"
              aria-label={`Finding ${f.number}: ${f.severity} ${dimensionLabel}`}
              onClick={() => onSelect(isActive ? null : f.id)}
              onPointerEnter={() => onSelect(f.id)}
              onPointerLeave={() => onSelect(null)}
              initial={reduce ? false : { opacity: 0, scale: 1.04 }}
              animate={{
                opacity: dimmed ? 0.28 : 1,
                scale: 1,
              }}
              transition={{
                duration: 0.5,
                delay: reduce ? 0 : 0.25 + i * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={style}
              className={cn(
                "absolute rounded-[3px] border-[1.5px] transition-[opacity,box-shadow] duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                isActive && "z-10",
              )}
            >
              {/* Corner ticks — reads as a measurement instrument rather than a generic box */}
              {isActive &&
                (
                  [
                    "left-0 top-0 border-l-2 border-t-2",
                    "right-0 top-0 border-r-2 border-t-2",
                    "left-0 bottom-0 border-b-2 border-l-2",
                    "right-0 bottom-0 border-b-2 border-r-2",
                  ] as const
                ).map((pos) => (
                  <span
                    key={pos}
                    aria-hidden
                    className={cn("absolute size-2", pos)}
                    style={{ borderColor: color }}
                  />
                ))}

              {/* Always-on number — lets a finding on the image be matched
                  to its card below without needing to hover first. */}
              <span
                aria-hidden
                className="absolute -left-[1.5px] -top-[1.5px] grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono text-[10px] font-medium"
                style={{ background: color, color: "oklch(0.145 0.012 265)" }}
              >
                {f.number}
              </span>

              {/* Dimension name — only on hover/active, so a busy image
                  with many findings doesn't get a permanent wall of text. */}
              {isActive && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-medium",
                    labelBelow ? "top-full mt-1.5" : "bottom-full mb-1.5",
                    labelRight ? "right-0" : "left-0",
                  )}
                  style={{ background: color, color: "oklch(0.145 0.012 265)" }}
                >
                  {dimensionLabel}
                </span>
              )}
            </motion.button>
          );
        })}

      {/* Instrument readout */}
      <div className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md border border-white/10 bg-black/65 px-2.5 py-1 font-mono text-[10px] text-foreground/55 backdrop-blur-sm">
        {findings.length} finding
        {findings.length === 1 ? "" : "s"} · numbered above, matching the list below
      </div>
    </div>
  );
}
