"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Download, Eye, EyeOff, ChevronUp, ChevronDown, Image as ImageIcon } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { fetchJson } from "@/lib/http";

export interface RebuildLayer {
  id: string;
  parentId: string | null;
  zIndex: number;
  kind: "shape" | "text" | "image" | "gradient" | "effect";
  bbox: [number, number, number, number];
  primitive: string | null;
  gradient: {
    kind: "linear" | "radial";
    angle: number;
    stops: { offset: number; color: string }[];
    center?: { x: number; y: number };
    radius?: number;
  } | null;
  d: string;
  fill: string;
  maskKey: string | null;
  confidence: number;
  name: string;
  note: string | null;
  hidden: boolean;
  /** How this layer's visual came to be — never overstate a raster fallback as a clean trace. */
  source: "traced-vector" | "photo" | "raster-crop" | "raster-cleaned" | null;
}

const REPLAY_STEP_MS = 350;
const PNG_EXPORT_SCALE = 2; // supersample for a crisper raster export than the source's own working resolution

function serializeSVG(svg: SVGSVGElement): string {
  let source = new XMLSerializer().serializeToString(svg);
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(source)) {
    source = source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return source;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rasterizes an SVG string to a PNG Blob via an offscreen canvas — the standard client-side technique, no server round trip. */
function rasterizeSVG(svgSource: string, width: number, height: number, scale: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgSource], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create PNG"))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterize SVG"));
    };
    img.src = url;
  });
}

const KIND_LABEL: Record<RebuildLayer["kind"], string> = {
  shape: "Shape",
  text: "Text",
  gradient: "Gradient",
  image: "Image",
  effect: "Effect",
};

const SOURCE_LABEL: Record<NonNullable<RebuildLayer["source"]>, string> = {
  "traced-vector": "Traced as a vector shape",
  photo: "Kept as a real photo crop, not vectorized",
  "raster-crop": "Vectorization gave a poor result — using the real pixels instead",
  "raster-cleaned": "Vectorization gave a poor result — an AI model cleaned up the real pixels",
};

function LayerFill({ layer }: { layer: RebuildLayer }) {
  const gid = `grad_${layer.id}`;
  if (layer.kind === "image" && layer.maskKey) {
    return <image href={layer.maskKey} x={layer.bbox[0]} y={layer.bbox[1]} width={layer.bbox[2]} height={layer.bbox[3]} preserveAspectRatio="none" />;
  }
  if (layer.kind === "gradient" && layer.gradient) {
    const { kind, angle, stops, center, radius } = layer.gradient;
    return (
      <>
        <defs>
          {kind === "linear" ? (
            <linearGradient id={gid} gradientTransform={`rotate(${angle})`}>
              {stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          ) : (
            <radialGradient
              id={gid}
              cx={center ? center.x - layer.bbox[0] : layer.bbox[2] / 2}
              cy={center ? center.y - layer.bbox[1] : layer.bbox[3] / 2}
              r={radius ?? Math.max(layer.bbox[2], layer.bbox[3]) / 2}
              gradientUnits="userSpaceOnUse"
            >
              {stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </radialGradient>
          )}
        </defs>
        {layer.d ? (
          <path d={layer.d} fill={`url(#${gid})`} />
        ) : (
          <rect x={layer.bbox[0]} y={layer.bbox[1]} width={layer.bbox[2]} height={layer.bbox[3]} fill={`url(#${gid})`} />
        )}
      </>
    );
  }
  if (layer.d) return <path d={layer.d} fill={layer.fill} />;
  if (layer.bbox[2] > 0 && layer.bbox[3] > 0) {
    return <rect x={layer.bbox[0]} y={layer.bbox[1]} width={layer.bbox[2]} height={layer.bbox[3]} fill={layer.fill} />;
  }
  return null;
}

/**
 * Replay timeline + layer inspector + SVG export — the shippable slice of
 * "an editor you can take over at any point": rename, recolor, hide,
 * reorder and export, live-rerendering, not a full canvas editor (that's
 * the repo's own Phase 4/5, with Yjs op-log tables already reserved and
 * still empty).
 */
export function RebuildCanvas({
  layers: initialLayers,
  canvasWidth,
  canvasHeight,
  accent,
}: {
  layers: RebuildLayer[];
  canvasWidth: number;
  canvasHeight: number;
  accent: string;
}) {
  const [layers, setLayers] = useState(initialLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sorted = useMemo(() => [...layers].sort((a, b) => a.zIndex - b.zIndex), [layers]);
  const [playhead, setPlayhead] = useState(sorted.length);
  const [playing, setPlaying] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerSvgRef = useRef<SVGSVGElement>(null);

  // Stops scheduling once the timeline reaches the end rather than calling
  // setPlaying(false) synchronously from inside the effect — `isPlaying`
  // below derives the "actually still advancing" state instead, so this
  // effect only ever sets state from the timer callback, not its own body.
  useEffect(() => {
    if (!playing || playhead >= sorted.length) return;
    const t = setTimeout(() => setPlayhead((p) => Math.min(sorted.length, p + 1)), REPLAY_STEP_MS);
    return () => clearTimeout(t);
  }, [playing, playhead, sorted.length]);

  const isPlaying = playing && playhead < sorted.length;

  function togglePlay() {
    if (playhead >= sorted.length) setPlayhead(0);
    setPlaying((p) => !p);
  }

  const visible = sorted.slice(0, playhead).filter((l) => !l.hidden);
  const currentStep = isPlaying ? sorted[Math.min(playhead, sorted.length - 1)] : null;
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  async function patchLayer(id: string, patch: Partial<Pick<RebuildLayer, "name" | "hidden" | "zIndex" | "fill">>) {
    const prev = layers;
    setLayers((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      await fetchJson(
        `/api/rebuild/layer/${id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
        "Could not save that change",
      );
    } catch {
      setLayers(prev); // roll back the optimistic update on a real save failure
    }
  }

  function moveLayer(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((l) => l.id === id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    const a = sorted[idx];
    const b = swapWith;
    patchLayer(a.id, { zIndex: b.zIndex });
    patchLayer(b.id, { zIndex: a.zIndex });
  }

  const [exporting, setExporting] = useState(false);

  // Serializing the LIVE rendered <svg> (not a hand-built parallel string)
  // is what guarantees every export always matches exactly what's on
  // screen, including every hide/reorder/recolor edit already applied.
  function downloadCanvasSVG() {
    const svg = svgRef.current;
    if (!svg) return;
    downloadBlob(new Blob([serializeSVG(svg)], { type: "image/svg+xml" }), "rebuild.svg");
  }

  async function downloadCanvasPNG() {
    const svg = svgRef.current;
    if (!svg || !canvasWidth || !canvasHeight) return;
    setExporting(true);
    try {
      const blob = await rasterizeSVG(serializeSVG(svg), canvasWidth, canvasHeight, PNG_EXPORT_SCALE);
      downloadBlob(blob, "rebuild.png");
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  // A single-layer SVG whose viewBox crops to exactly that layer's own
  // bbox — rendered via the same LayerFill component the main canvas uses
  // (layerSvgRef below), so a per-layer export can never drift from how
  // that layer actually renders on screen.
  function downloadLayerSVG() {
    const svg = layerSvgRef.current;
    if (!svg || !selected) return;
    downloadBlob(new Blob([serializeSVG(svg)], { type: "image/svg+xml" }), `${selected.name || "layer"}.svg`);
  }

  async function downloadLayerPNG() {
    const svg = layerSvgRef.current;
    if (!svg || !selected || selected.bbox[2] <= 0 || selected.bbox[3] <= 0) return;
    setExporting(true);
    try {
      const blob = await rasterizeSVG(serializeSVG(svg), selected.bbox[2], selected.bbox[3], PNG_EXPORT_SCALE);
      downloadBlob(blob, `${selected.name || "layer"}.png`);
    } catch (err) {
      console.error("Layer PNG export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <PrismPanel accent={accent} className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1.5 text-[12.5px] text-foreground/75 transition-colors hover:border-white/20 hover:text-foreground/95"
            >
              {isPlaying ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
              {isPlaying ? "Pause" : playhead >= sorted.length ? "Replay" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={sorted.length}
              value={playhead}
              onChange={(e) => {
                setPlaying(false);
                setPlayhead(Number(e.target.value));
              }}
              className="w-32 accent-current sm:w-48"
              style={{ color: accent }}
            />
            <span className="font-mono text-[11px] text-foreground/45">
              {playhead}/{sorted.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadCanvasSVG}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1.5 text-[12.5px] text-foreground/75 transition-colors hover:border-white/20 hover:text-foreground/95"
            >
              <Download className="size-3.5" aria-hidden />
              SVG
            </button>
            <button
              type="button"
              onClick={downloadCanvasPNG}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1.5 text-[12.5px] text-foreground/75 transition-colors hover:border-white/20 hover:text-foreground/95 disabled:opacity-50"
            >
              <ImageIcon className="size-3.5" aria-hidden />
              PNG
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[repeating-conic-gradient(#00000000_0_25%,#ffffff08_0_50%)] bg-[length:20px_20px]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvasWidth || 1} ${canvasHeight || 1}`}
            width="100%"
            className="block h-auto max-h-[70vh] w-full"
          >
            {visible.map((layer) => (
              <g key={layer.id} data-layer-id={layer.id}>
                <LayerFill layer={layer} />
              </g>
            ))}
          </svg>
        </div>

        {/* Off-screen, not display:none — kept renderable so it can be
            serialized/rasterized for per-layer export without ever being
            shown; reuses LayerFill so it can't drift from the real render. */}
        {selected && (
          <svg
            ref={layerSvgRef}
            aria-hidden
            style={{ position: "absolute", left: -99999, width: Math.max(1, selected.bbox[2]), height: Math.max(1, selected.bbox[3]) }}
            viewBox={`${selected.bbox[0]} ${selected.bbox[1]} ${Math.max(1, selected.bbox[2])} ${Math.max(1, selected.bbox[3])}`}
          >
            <LayerFill layer={selected} />
          </svg>
        )}

        {currentStep && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/60">
            <span style={{ color: accent }}>{KIND_LABEL[currentStep.kind]}</span> — {currentStep.name}
            {currentStep.note ? `: ${currentStep.note}` : ""}
          </p>
        )}
      </PrismPanel>

      <PrismPanel accent={accent} className="max-h-[80vh] overflow-y-auto p-4 sm:p-5">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          Layers <span className="text-foreground/35">({sorted.length})</span>
        </h2>
        <ul className="mt-3 space-y-1">
          {sorted.map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                onClick={() => setSelectedId(layer.id === selectedId ? null : layer.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.04]"
                style={
                  selectedId === layer.id
                    ? { background: `color-mix(in oklch, ${accent} 12%, transparent)`, color: accent }
                    : { color: layer.hidden ? "oklch(1 0 0 / 0.35)" : "oklch(1 0 0 / 0.75)" }
                }
              >
                <span
                  className="size-2 shrink-0 rounded-full border border-white/20"
                  style={{ background: layer.kind === "gradient" || layer.kind === "image" ? "transparent" : layer.fill }}
                />
                <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-foreground/35">{Math.round(layer.confidence * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>

        {selected && (
          <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-foreground/45">
                {KIND_LABEL[selected.kind]}
                {selected.primitive ? ` · ${selected.primitive}` : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveLayer(selected.id, 1)}
                  title="Move forward"
                  className="rounded-md border border-white/[0.09] p-1 text-foreground/55 transition-colors hover:text-foreground/90"
                >
                  <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => moveLayer(selected.id, -1)}
                  title="Move back"
                  className="rounded-md border border-white/[0.09] p-1 text-foreground/55 transition-colors hover:text-foreground/90"
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => patchLayer(selected.id, { hidden: !selected.hidden })}
                  title={selected.hidden ? "Show" : "Hide"}
                  className="rounded-md border border-white/[0.09] p-1 text-foreground/55 transition-colors hover:text-foreground/90"
                >
                  {selected.hidden ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                </button>
              </div>
            </div>

            <input
              value={selected.name}
              onChange={(e) => setLayers((cur) => cur.map((l) => (l.id === selected.id ? { ...l, name: e.target.value } : l)))}
              onBlur={(e) => patchLayer(selected.id, { name: e.target.value })}
              className="w-full rounded-lg border border-white/[0.09] bg-black/25 px-2.5 py-1.5 text-[13px] text-foreground/90 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
            />

            {selected.kind !== "gradient" && selected.kind !== "image" && (
              <label className="flex items-center gap-2 text-[12px] text-foreground/60">
                Fill
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(selected.fill) ? selected.fill : "#808080"}
                  onChange={(e) => patchLayer(selected.id, { fill: e.target.value })}
                  className="h-7 w-12 cursor-pointer rounded border border-white/[0.09] bg-transparent"
                />
                <span className="font-mono text-[11px] text-foreground/45">{selected.fill}</span>
              </label>
            )}

            {selected.note && <p className="text-[12px] leading-relaxed text-foreground/55">{selected.note}</p>}

            <p className="text-[11px] text-foreground/40">
              {selected.confidence >= 0.8
                ? "Measured with high confidence."
                : `Confidence ${Math.round(selected.confidence * 100)}% — worth a second look.`}
            </p>
            {selected.source && <p className="text-[11px] text-foreground/40">{SOURCE_LABEL[selected.source]}</p>}

            <div className="flex items-center gap-2 border-t border-white/[0.08] pt-3">
              <span className="text-[11px] text-foreground/45">Export this layer</span>
              <button
                type="button"
                onClick={downloadLayerSVG}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.09] px-2.5 py-1 text-[11.5px] text-foreground/70 transition-colors hover:border-white/20 hover:text-foreground/95"
              >
                SVG
              </button>
              <button
                type="button"
                onClick={downloadLayerPNG}
                disabled={exporting}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.09] px-2.5 py-1 text-[11.5px] text-foreground/70 transition-colors hover:border-white/20 hover:text-foreground/95 disabled:opacity-50"
              >
                PNG
              </button>
            </div>
          </div>
        )}
      </PrismPanel>
    </div>
  );
}
