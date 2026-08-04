"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { WordmarkGlass, type WordmarkGlassStats } from "@/components/brand/wordmark-glass";
import { cloneTuning, DEFAULT_TUNING, TUNING_SCHEMA, type GlassTuning, type TuningGroup } from "@/components/brand/glass-tuning";

const STORAGE_KEY = "opacitys.wordmark-lab.tuning.v1";
const GROUPS: TuningGroup[] = ["Geometry", "Glass", "Environment", "Interaction", "Post", "Align"];
const DEBUG_LABELS = ["Off", "∇d (gradient)", "Normal", "t", "h", "Fresnel", "Coverage"];

type ViewMode = "side-by-side" | "glass-only" | "svg-only" | "split" | "overlay-diff";

function readStoredTuning(): Partial<GlassTuning> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<GlassTuning>) : null;
  } catch {
    return null;
  }
}

export function WordmarkLab() {
  // Always DEFAULT_TUNING on the initial render, server and client alike —
  // reading localStorage inside useState's initializer makes the client's
  // first render diverge from the server's whenever a stored value exists,
  // which is a guaranteed hydration mismatch. The stored value (if any) is
  // applied a moment later, client-only, in the effect below.
  const [tuning, setTuning] = useState<GlassTuning>(() => cloneTuning(DEFAULT_TUNING));
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<ViewMode>("overlay-diff");
  const [debug, setDebug] = useState(0);
  const [stats, setStats] = useState<WordmarkGlassStats | null>(null);
  const [splitPos, setSplitPos] = useState(50);

  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [refOpacity, setRefOpacity] = useState(0.6);
  const [refBlend, setRefBlend] = useState<"normal" | "difference">("difference");
  const [refScale, setRefScale] = useState(1);
  const [refX, setRefX] = useState(0);
  const [refY, setRefY] = useState(0);

  const revokeRef = useRef<string | null>(null);

  const applyStoredTuning = useCallback(() => {
    const stored = readStoredTuning();
    if (stored) setTuning(cloneTuning(DEFAULT_TUNING, stored));
    setHydrated(true);
  }, []);
  useEffect(() => {
    // One-shot read of an external system (localStorage) on mount, applied
    // client-only so the server/first-client render stay identical (see the
    // comment on `tuning`'s initializer above) — same shape as the one other
    // read-once-on-mount site in this app, translate/page.tsx's loadEntries().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyStoredTuning();
  }, [applyStoredTuning]);

  useEffect(() => {
    if (!hydrated) return; // don't clobber a not-yet-applied stored value with the default
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  }, [tuning, hydrated]);

  const setField = useCallback(<K extends keyof GlassTuning>(key: K, value: GlassTuning[K]) => {
    setTuning((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onFile = useCallback((file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    const url = URL.createObjectURL(file);
    revokeRef.current = url;
    setRefUrl(url);
  }, []);

  useEffect(() => {
    return () => {
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<TuningGroup, typeof TUNING_SCHEMA>();
    for (const group of GROUPS) map.set(group, []);
    for (const field of TUNING_SCHEMA) map.get(field.group)!.push(field);
    return map;
  }, []);

  const copyJson = useCallback(async () => {
    const text = `export const DEFAULT_TUNING: GlassTuning = ${JSON.stringify(tuning, null, 2)};`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy tuning JSON:", text);
    }
  }, [tuning]);

  const reset = useCallback(() => setTuning(cloneTuning(DEFAULT_TUNING)), []);

  return (
    <div className="min-h-screen bg-black text-white/90">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px]">
        {/* --- Viewport ------------------------------------------------- */}
        <div className="relative flex flex-col gap-4 border-b border-white/10 p-6 lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {(["side-by-side", "glass-only", "svg-only", "split", "overlay-diff"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full border px-3 py-1 ${mode === m ? "border-white/60 bg-white/10" : "border-white/15 text-white/60 hover:border-white/30"}`}
              >
                {m}
              </button>
            ))}
            <span className="mx-2 h-4 w-px bg-white/15" />
            <label className="flex items-center gap-1.5">
              debug
              <select
                value={debug}
                onChange={(e) => setDebug(Number(e.target.value))}
                className="rounded border border-white/15 bg-black px-1.5 py-0.5"
              >
                {DEBUG_LABELS.map((label, i) => (
                  <option key={i} value={i}>
                    {i}: {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-black"
            style={{ minHeight: 320 }}
          >
            {(mode === "side-by-side" || mode === "svg-only") && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: mode === "side-by-side" ? 1 : 1 }}>
                <Wordmark className="text-[clamp(2.5rem,9vw,7rem)] tracking-[0.06em]" />
              </div>
            )}
            {mode === "side-by-side" && (
              <div className="absolute inset-x-0 top-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/40">SVG chrome</div>
            )}

            {(mode === "glass-only" || mode === "overlay-diff" || mode === "split") && (
              <div className="absolute inset-0 flex items-center justify-center">
                <WordmarkGlass
                  className="text-[clamp(2.5rem,9vw,7rem)] tracking-[0.06em]"
                  tuning={tuning}
                  debug={debug}
                  forceMode="gl"
                  onStats={setStats}
                />
              </div>
            )}

            {mode === "split" && (
              <>
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: `${splitPos}%` }}
                >
                  <div className="absolute inset-0 flex items-center justify-center" style={{ width: `${(100 / splitPos) * 100}%` }}>
                    <Wordmark className="text-[clamp(2.5rem,9vw,7rem)] tracking-[0.06em]" />
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={splitPos}
                  onChange={(e) => setSplitPos(Number(e.target.value))}
                  className="absolute inset-x-6 bottom-3 z-10"
                />
                <div
                  className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
                  style={{ left: `${splitPos}%` }}
                />
              </>
            )}

            {mode === "side-by-side" && (
              <div className="absolute inset-0 top-1/2 flex items-center justify-center border-t border-white/10 pt-4">
                <WordmarkGlass
                  className="text-[clamp(2.5rem,9vw,7rem)] tracking-[0.06em]"
                  tuning={tuning}
                  debug={debug}
                  forceMode="gl"
                  onStats={setStats}
                />
              </div>
            )}

            {refUrl && (mode === "overlay-diff") && (
              <img
                src={refUrl}
                alt="Reference overlay"
                className="pointer-events-none absolute"
                style={{
                  opacity: refOpacity,
                  mixBlendMode: refBlend,
                  transform: `translate(${refX}px, ${refY}px) scale(${refScale})`,
                  maxWidth: "90%",
                }}
              />
            )}
          </div>

          {/* --- Reference drop zone --- */}
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            onPaste={(e) => {
              const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
              onFile(item?.getAsFile() ?? undefined);
            }}
            onClick={() => document.getElementById("wordmark-lab-file")?.click()}
            className="cursor-pointer rounded-lg border border-dashed border-white/20 px-4 py-3 text-center text-[12px] text-white/50 hover:border-white/40"
          >
            {refUrl ? "Reference loaded — drop/paste/click to replace" : "Drop, paste, or click to load your reference image"}
            <input
              id="wordmark-lab-file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>

          {refUrl && mode === "overlay-diff" && (
            <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                opacity {refOpacity.toFixed(2)}
                <input type="range" min={0} max={1} step={0.01} value={refOpacity} onChange={(e) => setRefOpacity(Number(e.target.value))} />
              </label>
              <label className="flex flex-col gap-1">
                blend
                <select value={refBlend} onChange={(e) => setRefBlend(e.target.value as "normal" | "difference")} className="rounded border border-white/15 bg-black px-1 py-0.5">
                  <option value="difference">difference</option>
                  <option value="normal">normal</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                scale {refScale.toFixed(2)}
                <input type="range" min={0.3} max={2} step={0.01} value={refScale} onChange={(e) => setRefScale(Number(e.target.value))} />
              </label>
              <label className="flex flex-col gap-1">
                x {refX} / y {refY}
                <span className="flex gap-1">
                  <input type="range" min={-200} max={200} value={refX} onChange={(e) => setRefX(Number(e.target.value))} />
                  <input type="range" min={-200} max={200} value={refY} onChange={(e) => setRefY(Number(e.target.value))} />
                </span>
              </label>
            </div>
          )}

          {/* --- Readout --- */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white/[0.04] p-3 text-[11px] text-white/60 sm:grid-cols-4">
            <span>fps: {stats?.fps.toFixed(0) ?? "—"}</span>
            <span>frame: {stats?.frameMs.toFixed(2) ?? "—"}ms</span>
            <span>samples: {stats?.samples ?? "—"}</span>
            <span>scale: {stats?.renderScale.toFixed(2) ?? "—"}</span>
            <span>radius: {stats?.radiusPx.toFixed(2) ?? "—"}px</span>
            <span>hdr: {stats ? (stats.hdr ? "yes" : "no") : "—"}</span>
            <span>mode: {stats?.mode ?? "—"}</span>
          </div>
        </div>

        {/* --- Controls --------------------------------------------------- */}
        <div className="flex flex-col gap-5 overflow-y-auto p-6 lg:max-h-screen">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-medium">Wordmark glass lab</h1>
            <div className="flex gap-2">
              <button onClick={reset} className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:border-white/40">
                Reset
              </button>
              <button onClick={copyJson} className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:border-white/40">
                Copy JSON
              </button>
            </div>
          </div>

          {GROUPS.map((group) => (
            <fieldset key={group} className="rounded-lg border border-white/10 p-3">
              <legend className="px-1 text-[11px] uppercase tracking-[0.15em] text-white/50">{group}</legend>
              <div className="mt-2 flex flex-col gap-3">
                {grouped.get(group)!.map((field) => (
                  <label key={field.key} className="flex flex-col gap-1 text-[11px] text-white/70">
                    <span className="flex justify-between">
                      <span>{field.label}</span>
                      <span className="tabular-nums text-white/45">{tuning[field.key].toFixed(3)}</span>
                    </span>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={tuning[field.key]}
                      onChange={(e) => setField(field.key, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
