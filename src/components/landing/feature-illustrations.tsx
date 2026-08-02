"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { SPECTRUM, DIMENSION_ORDER } from "@/lib/critique/spectrum";
import type { ModuleDef } from "@/lib/copy";

/**
 * Nine bespoke schematic diagrams, one per module, replacing the single
 * paragraph the old module grid gave each feature. Each is built from the
 * brand's existing vocabulary — hairline strokes, the spectral palette,
 * `SPECTRUM`'s colours — rather than stock icons, so they read as part of
 * the same system as the wordmark and the spectrum-split diagram, not as
 * decoration bolted onto the copy.
 *
 * Every diagram stages in as a set of small grouped pieces (a marker plus
 * its chip, one bar, one node) rather than one opaque shape, so the reveal
 * itself explains structure — the same idea `ScrollReveal` applies to text,
 * applied to a picture. Remounted by the caller on every tab switch (keyed
 * under AnimatePresence), so these animate on mount rather than on scroll.
 */

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};
const piece: Variants = {
  hidden: { opacity: 0, y: 7 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
const draw: Variants = {
  hidden: { opacity: 0, pathLength: 0 },
  visible: { opacity: 1, pathLength: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

const hairline = "oklch(1 0 0 / 0.28)";
const faint = "oklch(1 0 0 / 0.14)";
const dim = "oklch(1 0 0 / 0.5)";

export function FeatureIllustration({
  slug,
  accent,
  reduce,
}: {
  slug: ModuleDef["slug"];
  accent: string;
  reduce: boolean;
}) {
  return (
    <motion.svg
      viewBox="0 0 320 200"
      className="h-full w-full"
      initial={reduce ? false : "hidden"}
      animate="visible"
      variants={container}
    >
      {DIAGRAMS[slug]({ accent })}
    </motion.svg>
  );
}

function Frame({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <motion.rect
      variants={piece}
      x={x}
      y={y}
      width={w}
      height={h}
      rx="4"
      fill="oklch(1 0 0 / 0.02)"
      stroke={hairline}
      strokeWidth="1"
    />
  );
}

const DIAGRAMS: Record<ModuleDef["slug"], (p: { accent: string }) => ReactNode> = {
  // Image frame, three pinned findings, one measured chip, seven score bars.
  critique: ({ accent }) => (
    <>
      <Frame x={24} y={28} w={148} h={124} />
      {[
        { x: 62, y: 64 },
        { x: 128, y: 54 },
        { x: 92, y: 118 },
      ].map((m, i) => (
        <motion.g key={i} variants={piece}>
          <circle cx={m.x} cy={m.y} r="4" fill={accent} />
          <circle cx={m.x} cy={m.y} r="8" fill="none" stroke={accent} strokeOpacity="0.4" />
        </motion.g>
      ))}
      <motion.g variants={piece}>
        <rect x={62} y={128} width="52" height="16" rx="8" fill="oklch(0 0 0 / 0.4)" stroke={hairline} />
        <text x={88} y={139} textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.85" fontFamily="ui-monospace, monospace">
          4.2 : 1
        </text>
      </motion.g>
      {DIMENSION_ORDER.map((d, i) => {
        const h = 26 + ((i * 37) % 70);
        return (
          <motion.rect
            key={d}
            variants={piece}
            x={196 + i * 13}
            y={148 - h}
            width="7"
            height={h}
            rx="2"
            fill={SPECTRUM[d].color}
            opacity="0.85"
          />
        );
      })}
    </>
  ),

  // A poster separating into stacked, offset, labelled layers.
  rebuild: ({ accent }) => {
    const layers = [
      { dx: 0, dy: 26, label: "BASE" },
      { dx: 14, dy: 14, label: "GRADIENT" },
      { dx: 28, dy: 2, label: "SHAPE" },
      { dx: 42, dy: -10, label: "TYPE" },
    ];
    return (
      <>
        {layers.map((l, i) => (
          <motion.g key={l.label} variants={piece}>
            <rect
              x={70 + l.dx}
              y={56 + l.dy}
              width="120"
              height="88"
              rx="5"
              fill={
                i === layers.length - 1
                  ? `color-mix(in oklch, ${accent} 20%, transparent)`
                  : "oklch(1 0 0 / 0.035)"
              }
              stroke={i === layers.length - 1 ? accent : hairline}
              strokeWidth="1"
            />
            <text
              x={78 + l.dx}
              y={72 + l.dy}
              fontSize="8"
              letterSpacing="0.08em"
              fill="white"
              fillOpacity="0.6"
            >
              {l.label}
            </text>
          </motion.g>
        ))}
      </>
    );
  },

  // A proportion donut with labelled percentage slices.
  identify: ({ accent }) => {
    const slices = [
      { frac: 0.6, color: accent, label: "60% Swiss" },
      { frac: 0.3, color: SPECTRUM.typography.color, label: "30% Brutalist" },
      { frac: 0.1, color: SPECTRUM.spacing.color, label: "10% Editorial" },
    ];
    const r = 46;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return (
      <>
        <motion.circle
          variants={piece}
          cx="98"
          cy="100"
          r={r}
          fill="none"
          stroke={faint}
          strokeWidth="16"
        />
        {slices.map((s) => {
          const len = c * s.frac;
          const dash = `${len} ${c - len}`;
          const el = (
            <motion.circle
              key={s.label}
              variants={piece}
              cx="98"
              cy="100"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 98 100)"
            />
          );
          offset += len;
          return el;
        })}
        {slices.map((s, i) => (
          <motion.g key={`${s.label}-label`} variants={piece}>
            <rect x={190} y={62 + i * 26} width="8" height="8" rx="2" fill={s.color} />
            <text x={204} y={70 + i * 26} fontSize="10" fill="white" fillOpacity="0.75">
              {s.label}
            </text>
          </motion.g>
        ))}
      </>
    );
  },

  // A rising multi-line chart in spectral colours, with a "why" annotation.
  trends: ({ accent }) => {
    const lines = [
      { color: accent, pts: "24,150 70,132 116,140 162,96 208,104 254,58" },
      { color: SPECTRUM.layout.color, pts: "24,168 70,160 116,150 162,140 208,120 254,110" },
      { color: SPECTRUM.spacing.color, pts: "24,178 70,176 116,172 162,166 208,158 254,150" },
    ];
    return (
      <>
        <Frame x={16} y={24} w={256} h={158} />
        {lines.map((l) => (
          <motion.polyline
            key={l.color}
            variants={draw}
            points={l.pts}
            fill="none"
            stroke={l.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <motion.g variants={piece}>
          <circle cx="254" cy="58" r="4" fill={accent} />
          <line x1="254" y1="58" x2="254" y2="38" stroke={accent} strokeOpacity="0.5" />
          <text x="254" y="32" textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.7">
            why it caught
          </text>
        </motion.g>
      </>
    );
  },

  // An ordered node graph, each node carrying a tool chip.
  workflow: ({ accent }) => {
    const nodes = [
      { x: 40, label: "Brief" },
      { x: 116, label: "Figma" },
      { x: 192, label: "Magnific" },
      { x: 268, label: "Export" },
    ];
    return (
      <>
        <motion.line
          variants={draw}
          x1="40"
          y1="100"
          x2="268"
          y2="100"
          stroke={hairline}
          strokeWidth="1.5"
        />
        {nodes.map((n, i) => (
          <motion.g key={n.label} variants={piece}>
            <circle cx={n.x} cy="100" r="12" fill="oklch(0.145 0.012 265)" stroke={i === 0 || i === nodes.length - 1 ? hairline : accent} strokeWidth="1.5" />
            {i > 0 && i < nodes.length - 1 && <circle cx={n.x} cy="100" r="4" fill={accent} />}
            <text x={n.x} y="128" textAnchor="middle" fontSize="9.5" fill="white" fillOpacity="0.7">
              {n.label}
            </text>
          </motion.g>
        ))}
      </>
    );
  },

  // An app window with a highlighted menu path.
  tools: ({ accent }) => (
    <>
      <Frame x={24} y={24} w={272} h={152} />
      <motion.g variants={piece}>
        <line x1="24" y1="48" x2="296" y2="48" stroke={hairline} />
        {[38, 46, 54].map((cx) => (
          <circle key={cx} cx={cx} cy="36" r="2.5" fill={dim} />
        ))}
      </motion.g>
      <motion.g variants={piece}>
        <rect x={40} y={62} width="72" height="108" rx="3" fill="oklch(1 0 0 / 0.02)" stroke={faint} />
        {["File", "Edit", "View", "Guides"].map((label, i) => (
          <text key={label} x={52} y={82 + i * 20} fontSize="9" fill={label === "Guides" ? accent : "white"} fillOpacity={label === "Guides" ? 1 : 0.55}>
            {label}
          </text>
        ))}
        <rect
          x={44}
          y={130}
          width="64"
          height="16"
          rx="3"
          fill={`color-mix(in oklch, ${accent} 20%, transparent)`}
          stroke={accent}
        />
      </motion.g>
      <motion.g variants={piece}>
        <line x1="112" y1="138" x2="150" y2="138" stroke={accent} strokeDasharray="3 3" />
        <circle cx="154" cy="138" r="3" fill={accent} />
      </motion.g>
    </>
  ),

  // A vague quote bubble, an arrow, three concrete action lines.
  translate: ({ accent }) => (
    <>
      <motion.g variants={piece}>
        <path
          d="M24,32 h108 a6,6 0 0 1 6,6 v52 a6,6 0 0 1 -6,6 h-70 l-16,16 v-16 h-22 a6,6 0 0 1 -6,-6 v-52 a6,6 0 0 1 6,-6 z"
          fill="oklch(1 0 0 / 0.03)"
          stroke={hairline}
        />
        {[46, 58, 70].map((y, i) => (
          <line key={y} x1="40" y1={y} x2={40 + [80, 64, 44][i]} y2={y} stroke={dim} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 6" />
        ))}
      </motion.g>
      <motion.path
        variants={draw}
        d="M162,66 h34"
        stroke={accent}
        strokeWidth="1.5"
        markerEnd="url(#translate-arrow)"
        fill="none"
      />
      <defs>
        <marker id="translate-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={accent} />
        </marker>
      </defs>
      {["Raise the headline weight", "Tighten the grid to 8px", "Cut the drop shadow"].map((t, i) => (
        <motion.g key={t} variants={piece}>
          <circle cx={214} cy={40 + i * 24} r="5" fill="none" stroke={accent} strokeWidth="1.5" />
          <path d={`M211.5,${40 + i * 24} l2,2.5 l4,-5`} stroke={accent} strokeWidth="1.5" fill="none" />
          <text x={228} y={44 + i * 24} fontSize="9" fill="white" fillOpacity="0.72">
            {t}
          </text>
        </motion.g>
      ))}
    </>
  ),

  // A dense cluster with your point held off it, radius drawn.
  originality: ({ accent }) => {
    const cluster = [
      [66, 78], [80, 92], [58, 96], [90, 70], [72, 106], [100, 88], [64, 62],
    ];
    return (
      <>
        <motion.circle
          variants={piece}
          cx="76"
          cy="86"
          r="52"
          fill="none"
          stroke={hairline}
          strokeDasharray="3 4"
        />
        {cluster.map(([x, y], i) => (
          <motion.circle key={i} variants={piece} cx={x} cy={y} r="4" fill={dim} />
        ))}
        <motion.line variants={draw} x1="118" y1="86" x2="238" y2="86" stroke={accent} strokeOpacity="0.5" strokeDasharray="2 4" />
        <motion.g variants={piece}>
          <circle cx="246" cy="86" r="7" fill={accent} />
          <text x="246" y="112" textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.75">
            your idea
          </text>
        </motion.g>
        <motion.text variants={piece} x="178" y="78" textAnchor="middle" fontSize="9" fill={accent}>
          distance
        </motion.text>
      </>
    );
  },

  // A balance scale weighing "free" against "licensed", resolving to a
  // cleared seal — the shape of what Clearance actually answers.
  rights: ({ accent }) => {
    const beamY = 56;
    const leftX = 90;
    const rightX = 230;
    return (
      <>
        <motion.line variants={draw} x1="160" y1={beamY} x2="160" y2="30" stroke={hairline} strokeWidth="1.5" />
        <motion.line variants={draw} x1={leftX} y1={beamY} x2={rightX} y2={beamY} stroke={hairline} strokeWidth="1.5" />
        <motion.path variants={piece} d="M150,30 L170,30 L160,16 Z" fill={dim} />
        {[leftX, rightX].map((x, i) => (
          <motion.g key={x} variants={piece}>
            <line x1={x} y1={beamY} x2={x} y2={beamY + 34} stroke={hairline} strokeWidth="1" />
            <ellipse
              cx={x}
              cy={beamY + 40}
              rx="22"
              ry="9"
              fill="oklch(1 0 0 / 0.03)"
              stroke={i === 0 ? hairline : accent}
              strokeWidth="1.5"
            />
          </motion.g>
        ))}
        <motion.text variants={piece} x={leftX} y={beamY + 62} textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.65">
          free
        </motion.text>
        <motion.text variants={piece} x={rightX} y={beamY + 62} textAnchor="middle" fontSize="9" fill={accent}>
          licensed
        </motion.text>
        <motion.g variants={piece}>
          <circle cx="160" cy="152" r="24" fill="none" stroke={accent} strokeWidth="1.5" />
          <path
            d="M149,152 l8,8 l15,-17"
            stroke={accent}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
        <motion.text variants={piece} x="160" y="192" textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.6">
          cleared to use
        </motion.text>
      </>
    );
  },

  // Overlapping palette swatches over a repeating signature trace.
  profile: () => (
    <>
      <motion.path
        variants={draw}
        d="M20,150 C60,80 90,190 130,110 S200,60 240,130 S290,90 300,120"
        fill="none"
        stroke={faint}
        strokeWidth="1.5"
      />
      {DIMENSION_ORDER.slice(0, 5).map((d, i) => (
        <motion.circle
          key={d}
          variants={piece}
          cx={92 + i * 30}
          cy={72}
          r="18"
          fill={SPECTRUM[d].color}
          opacity="0.82"
          stroke="oklch(0.145 0.012 265)"
          strokeWidth="3"
        />
      ))}
    </>
  ),
};
