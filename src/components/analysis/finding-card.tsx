"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Dimension, Severity } from "@/lib/critique/types";
import { SEVERITY, SPECTRUM } from "@/lib/critique/spectrum";

export interface FindingCardData {
  id: string;
  dimension: Dimension;
  severity: Severity;
  measured: { value: number; expected: [number, number]; unit: string };
  message: string;
  fix: string;
  confidence: number;
}

export function FindingCard({
  finding,
  active,
  index,
  onHover,
}: {
  finding: FindingCardData;
  active: boolean;
  index: number;
  onHover: (id: string | null) => void;
}) {
  const reduce = useReducedMotion();
  const spectral = SPECTRUM[finding.dimension];
  const severity = SEVERITY[finding.severity];
  const { measured } = finding;

  return (
    <motion.button
      type="button"
      onPointerEnter={() => onHover(finding.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(finding.id)}
      onBlur={() => onHover(null)}
      initial={reduce ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.6,
        delay: reduce ? 0 : index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border p-4 text-left",
        "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45",
        active
          ? "border-white/16 bg-white/[0.05]"
          : "border-white/[0.07] bg-white/[0.018] hover:bg-white/[0.035]",
      )}
    >
      {/* Spectral spine — the dimension's identity, always visible */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] transition-all duration-300"
        style={{
          background: spectral?.color,
          opacity: active ? 1 : 0.5,
          boxShadow: active ? `0 0 14px ${spectral?.color}` : "none",
        }}
      />

      <div className="flex items-center gap-2.5 pl-2">
        <span
          className="text-[10px] uppercase tracking-[0.16em]"
          style={{ color: spectral?.color }}
        >
          {spectral?.label ?? finding.dimension}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em]"
          style={{
            color: severity?.color,
            background: `color-mix(in oklch, ${severity?.color} 13%, transparent)`,
            border: `1px solid color-mix(in oklch, ${severity?.color} 26%, transparent)`,
          }}
        >
          {severity?.label}
        </span>
        <span className="ml-auto font-mono text-[10px] text-foreground/50">
          {Math.round(finding.confidence * 100)}%
        </span>
      </div>

      <p className="mt-2.5 pl-2 text-[13.5px] leading-relaxed text-foreground/82">
        {finding.message}
      </p>

      {/* The measurement — the reason this finding is trustworthy */}
      <div className="mt-3 ml-2 flex items-baseline gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-1.5 font-mono text-[11px]">
        <span className="text-foreground/50">measured</span>
        <span style={{ color: spectral?.color }}>
          {measured.value}
          {measured.unit}
        </span>
        <span className="text-foreground/50">/</span>
        <span className="text-foreground/50">expected</span>
        <span className="text-foreground/62">
          {measured.expected[0]}–{measured.expected[1]}
          {measured.unit}
        </span>
      </div>

      <p className="mt-3 pl-2 text-[13px] leading-relaxed text-foreground/52">
        <span className="text-foreground/78">Fix — </span>
        {finding.fix}
      </p>
    </motion.button>
  );
}
