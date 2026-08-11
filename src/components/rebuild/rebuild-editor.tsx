"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  MousePointer2,
  SquareDashed,
  Check,
  X,
} from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { fetchJson } from "@/lib/http";

export interface EditorLayer {
  id: string;
  parentId: string | null;
  zIndex: number;
  kind: string;
  /** x, y, w, h in this version's image pixel space. */
  bbox: [number, number, number, number];
  thumbUrl: string | null;
  name: string;
  note: string | null;
  hidden: boolean;
  confidence: number;
}

export interface EditorVersion {
  id: string;
  parentId: string | null;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  instruction: string | null;
  label: string | null;
  status: string;
  createdAt: string;
}

/** Normalized rect in 0-1 space, so overlays scale with the rendered image. */
interface NormRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const EDIT_COPY: Record<string, string> = {
  queued: "Queued…",
  generating: "Redrawing the design…",
  detecting: "Finding the elements again…",
};

function toNorm(bbox: [number, number, number, number], w: number, h: number): NormRect {
  if (!w || !h) return { left: 0, top: 0, width: 0, height: 0 };
  return { left: bbox[0] / w, top: bbox[1] / h, width: bbox[2] / w, height: bbox[3] / h };
}

function pct(v: number): string {
  return `${(v * 100).toFixed(3)}%`;
}

export function RebuildEditor({
  analysisId,
  versions,
  layersByVersion,
  accent,
}: {
  analysisId: string;
  versions: EditorVersion[];
  layersByVersion: Record<string, EditorLayer[]>;
  accent: string;
}) {
  const router = useRouter();

  // `versions` and `layersByVersion` are read straight from props, never
  // copied into state: an edit finishes with router.refresh(), and state
  // seeded from props on mount would ignore that refresh entirely — the
  // new version would generate server-side and never appear.
  const latestCompleteId = useMemo(
    () => versions.filter((v) => v.status === "complete" && v.imageUrl).at(-1)?.id ?? versions[0]?.id ?? "",
    [versions],
  );

  // Null means "follow the newest version"; set only when the user picks an
  // older one from the history, so a fresh edit auto-advances but browsing
  // history doesn't get yanked away.
  const [pinnedVersionId, setPinnedVersionId] = useState<string | null>(null);
  const currentVersionId =
    pinnedVersionId && versions.some((v) => v.id === pinnedVersionId) ? pinnedVersionId : latestCompleteId;

  // Optimistic rename/hide, merged over the server's rows at render time
  // rather than replacing them — same reason as above.
  const [layerOverrides, setLayerOverrides] = useState<Record<string, Partial<EditorLayer>>>({});

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<NormRect | null>(null);
  const [tool, setTool] = useState<"select" | "marquee">("select");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [instruction, setInstruction] = useState("");
  const [editStage, setEditStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const teardown = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);
  useEffect(() => teardown, [teardown]);

  const version = versions.find((v) => v.id === currentVersionId) ?? null;
  const layers = useMemo(
    () => (layersByVersion[currentVersionId] ?? []).map((l) => ({ ...l, ...layerOverrides[l.id] })),
    [layersByVersion, currentVersionId, layerOverrides],
  );
  const selected = layers.find((l) => l.id === selectedLayerId) ?? null;
  const imgW = version?.width ?? 0;
  const imgH = version?.height ?? 0;
  const busy = editStage !== null;

  // Children keyed by parent, so the panel can render the tree recursively.
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, EditorLayer[]>();
    for (const l of [...layers].sort((a, b) => a.zIndex - b.zIndex)) {
      const key = l.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return map;
  }, [layers]);

  // ---- marquee dragging -------------------------------------------------
  // Pointer capture rather than window listeners, so a drag that leaves the
  // canvas still tracks — same approach as components/landing/opacity-reveal.tsx.

  function pointAt(e: React.PointerEvent): { x: number; y: number } | null {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (tool !== "marquee" || busy) return;
    const p = pointAt(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = p;
    setSelectedLayerId(null);
    setMarquee({ left: p.x, top: p.y, width: 0, height: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const p = pointAt(e);
    if (!p) return;
    const s = dragStart.current;
    setMarquee({
      left: Math.min(s.x, p.x),
      top: Math.min(s.y, p.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
  }

  function onPointerUp() {
    if (!dragStart.current) return;
    dragStart.current = null;
    // A stray click rather than a real drag — don't leave a zero-size box
    // sitting there with a prompt attached to it.
    setMarquee((m) => (m && m.width > 0.01 && m.height > 0.01 ? m : null));
  }

  // ---- editing ----------------------------------------------------------

  const activeRect: NormRect | null = selected ? toNorm(selected.bbox, imgW, imgH) : marquee;

  async function submitEdit() {
    const text = instruction.trim();
    if (!text || busy || !version) return;
    setError(null);
    teardown();

    try {
      setEditStage("queued");
      const body: Record<string, unknown> = { instruction: text, parentVersionId: version.id };
      if (selected) {
        body.layerId = selected.id;
      } else if (marquee && imgW && imgH) {
        body.region = [
          Math.round(marquee.left * imgW),
          Math.round(marquee.top * imgH),
          Math.round(marquee.width * imgW),
          Math.round(marquee.height * imgH),
        ];
      }

      const { versionId } = await fetchJson<{ versionId: string }>(
        `/api/rebuild/${analysisId}/edit`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        "Could not start that edit",
      );

      const source = new EventSource(`/api/rebuild/version/${versionId}/stream`);
      sourceRef.current = source;

      source.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setEditStage(data.stage ?? data.status ?? "queued");
      });

      source.addEventListener("complete", () => {
        teardown();
        setEditStage(null);
        setInstruction("");
        setMarquee(null);
        setSelectedLayerId(null);
        // Unpin so the refreshed props' newest version becomes current —
        // otherwise an edit made while browsing history would complete
        // out of sight.
        setPinnedVersionId(null);
        // The server owns versions + layers; re-render rather than trying
        // to reconstruct the new version's tree on the client.
        router.refresh();
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        teardown();
        setEditStage(null);
        setError(reason ?? "That edit didn't work. Try describing it differently.");
      });

      source.addEventListener("timeout", () => {
        teardown();
        setEditStage(null);
        setError("That edit is taking longer than expected. Try again in a moment.");
      });
    } catch (err) {
      teardown();
      setEditStage(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function patchLayer(id: string, patch: Partial<Pick<EditorLayer, "name" | "hidden">>) {
    const before = layerOverrides[id];
    setLayerOverrides((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
    try {
      await fetchJson(
        `/api/rebuild/layer/${id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
        "Could not save that change",
      );
    } catch {
      // Roll back just this layer's override, not everyone's.
      setLayerOverrides((cur) => ({ ...cur, [id]: before ?? {} }));
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadPNG() {
    if (!version?.imageUrl) return;
    const a = document.createElement("a");
    a.href = version.imageUrl;
    a.download = `${version.label ?? "rebuild"}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }

  function renderTree(parentId: string | null, depth: number): React.ReactNode {
    const kids = childrenOf.get(parentId) ?? [];
    if (kids.length === 0) return null;
    return kids.map((layer) => {
      const hasKids = (childrenOf.get(layer.id) ?? []).length > 0;
      const isOpen = !collapsed.has(layer.id);
      const isSel = layer.id === selectedLayerId;
      return (
        <li key={layer.id}>
          <div
            className="group flex items-center gap-1.5 rounded-lg pr-1 transition-colors hover:bg-white/[0.04]"
            style={
              isSel
                ? { background: `color-mix(in oklch, ${accent} 14%, transparent)` }
                : undefined
            }
          >
            <span style={{ width: depth * 12 }} aria-hidden />
            <button
              type="button"
              onClick={() => hasKids && toggleCollapse(layer.id)}
              className={`shrink-0 rounded p-0.5 ${hasKids ? "text-foreground/45 hover:text-foreground/80" : "invisible"}`}
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              <ChevronRight className={`size-3 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setMarquee(null);
                setSelectedLayerId(isSel ? null : layer.id);
              }}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-[12.5px]"
              style={{ color: isSel ? accent : layer.hidden ? "oklch(1 0 0 / 0.35)" : "oklch(1 0 0 / 0.78)" }}
            >
              <span className="size-7 shrink-0 overflow-hidden rounded border border-white/[0.09] bg-black/30">
                {layer.thumbUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element -- external Blob thumbnail, not a local asset */
                  <img src={layer.thumbUrl} alt="" className="size-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{layer.name}</span>
            </button>
            <button
              type="button"
              onClick={() => patchLayer(layer.id, { hidden: !layer.hidden })}
              title={layer.hidden ? "Show" : "Hide"}
              className="shrink-0 p-1 text-foreground/40 opacity-0 transition-opacity hover:text-foreground/85 group-hover:opacity-100"
            >
              {layer.hidden ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            </button>
          </div>
          {hasKids && isOpen && <ul>{renderTree(layer.id, depth + 1)}</ul>}
        </li>
      );
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <PrismPanel accent={accent} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-white/[0.09] p-0.5">
            {(
              [
                ["select", MousePointer2, "Select a layer"],
                ["marquee", SquareDashed, "Drag a region"],
              ] as const
            ).map(([id, Icon, title]) => (
              <button
                key={id}
                type="button"
                title={title}
                onClick={() => {
                  setTool(id);
                  if (id === "select") setMarquee(null);
                }}
                className="rounded-full p-1.5 transition-colors"
                style={
                  tool === id
                    ? { background: `color-mix(in oklch, ${accent} 22%, transparent)`, color: accent }
                    : { color: "oklch(1 0 0 / 0.55)" }
                }
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={downloadPNG}
            disabled={!version?.imageUrl}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1.5 text-[12.5px] text-foreground/75 transition-colors hover:border-white/20 hover:text-foreground/95 disabled:opacity-40"
          >
            <Download className="size-3.5" aria-hidden />
            PNG
          </button>
        </div>

        <div
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative mt-4 select-none overflow-hidden rounded-xl border border-white/[0.08]"
          style={{
            cursor: tool === "marquee" ? "crosshair" : "default",
            touchAction: "none",
            // A neutral checkerboard, not the app's dark theme — transparency
            // needs a backdrop that reads as "nothing here" regardless of
            // theme, the same convention every design tool uses. Without it,
            // a transparent PNG with dark art is nearly invisible on a plain
            // dark panel and easy to mistake for a broken render.
            backgroundColor: "#e8e8e8",
            backgroundImage:
              "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
          }}
        >
          {version?.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset */
            <img
              src={version.imageUrl}
              alt={version.label ?? "Design"}
              draggable={false}
              className="block max-h-[70vh] w-full object-contain"
            />
          ) : (
            <div className="grid h-64 place-items-center text-[13px] text-foreground/45">No image yet.</div>
          )}

          {/* Layer hit-targets + hover outlines. Percentage-positioned so
              they track the image at any rendered size. */}
          {tool === "select" &&
            !busy &&
            layers
              .filter((l) => !l.hidden)
              .map((layer) => {
                const r = toNorm(layer.bbox, imgW, imgH);
                const isSel = layer.id === selectedLayerId;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => {
                      setMarquee(null);
                      setSelectedLayerId(isSel ? null : layer.id);
                    }}
                    title={layer.name}
                    className="absolute transition-colors"
                    style={{
                      left: pct(r.left),
                      top: pct(r.top),
                      width: pct(r.width),
                      height: pct(r.height),
                      outline: isSel ? `2px solid ${accent}` : "1px solid transparent",
                      background: isSel ? `color-mix(in oklch, ${accent} 10%, transparent)` : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.outline = `1px solid ${accent}`;
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel) e.currentTarget.style.outline = "1px solid transparent";
                    }}
                  />
                );
              })}

          {marquee && (
            <div
              className="pointer-events-none absolute border-2 border-dashed"
              style={{
                left: pct(marquee.left),
                top: pct(marquee.top),
                width: pct(marquee.width),
                height: pct(marquee.height),
                borderColor: accent,
                background: `color-mix(in oklch, ${accent} 10%, transparent)`,
              }}
            />
          )}

          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]">
              <p className="flex items-center gap-2 text-[13px] text-foreground/85">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {EDIT_COPY[editStage ?? ""] ?? "Working…"}
              </p>
            </div>
          )}
        </div>

        {/* Describe-edits prompt. Anchored under the canvas rather than
            floating over the selection — at these image sizes a floating
            panel covers the very thing being edited. */}
        <div className="mt-4 rounded-xl border border-white/[0.09] bg-black/25 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">
              {selected ? `Editing ${selected.name}` : marquee ? "Editing the selected region" : "Editing the whole image"}
            </span>
            {activeRect && (
              <button
                type="button"
                onClick={() => {
                  setSelectedLayerId(null);
                  setMarquee(null);
                }}
                className="inline-flex items-center gap-1 text-[11.5px] text-foreground/45 transition-colors hover:text-foreground/80"
              >
                <X className="size-3" aria-hidden />
                Clear
              </button>
            )}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitEdit();
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="Describe edits — e.g. change the button text to Close the Studio"
              className="min-w-0 flex-1 resize-y rounded-lg border border-white/[0.09] bg-black/30 p-2.5 text-[13px] leading-relaxed text-foreground/90 placeholder:text-foreground/45 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={submitEdit}
              disabled={busy || !instruction.trim()}
              className="mb-0.5 shrink-0 rounded-full p-2 transition-colors disabled:opacity-40"
              style={{ background: `color-mix(in oklch, ${accent} 22%, transparent)`, color: accent }}
              title="Apply (⌘↵)"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
              {error}
            </p>
          )}
        </div>
      </PrismPanel>

      <PrismPanel accent={accent} className="max-h-[80vh] overflow-y-auto p-4 sm:p-5">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          Layers <span className="text-foreground/35">({layers.length})</span>
        </h2>
        <ul className="mt-2.5">{renderTree(null, 0)}</ul>

        {selected && (
          <div className="mt-4 space-y-2 border-t border-white/[0.08] pt-4">
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-foreground/45">{selected.kind}</span>
            <input
              value={selected.name}
              onChange={(e) =>
                setLayerOverrides((cur) => ({
                  ...cur,
                  [selected.id]: { ...cur[selected.id], name: e.target.value },
                }))
              }
              onBlur={(e) => patchLayer(selected.id, { name: e.target.value })}
              className="w-full rounded-lg border border-white/[0.09] bg-black/25 px-2.5 py-1.5 text-[13px] text-foreground/90 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
            />
            {selected.note && <p className="text-[12px] leading-relaxed text-foreground/55">{selected.note}</p>}
          </div>
        )}

        <div className="mt-5 border-t border-white/[0.08] pt-4">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">History</h3>
          <ul className="mt-2.5 space-y-1">
            {versions.map((v) => {
              const isCur = v.id === currentVersionId;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={v.status !== "complete"}
                    onClick={() => {
                      // Pin to the newest by clearing, so the next edit
                      // still auto-advances rather than sticking here.
                      setPinnedVersionId(v.id === latestCompleteId ? null : v.id);
                      setSelectedLayerId(null);
                      setMarquee(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12.5px] transition-colors hover:bg-white/[0.04] disabled:opacity-40"
                    style={{ color: isCur ? accent : "oklch(1 0 0 / 0.7)" }}
                  >
                    <span className="size-8 shrink-0 overflow-hidden rounded border border-white/[0.09] bg-black/30">
                      {v.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local asset */
                        <img src={v.imageUrl} alt="" className="size-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{v.label ?? v.instruction ?? "Untitled"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PrismPanel>
    </div>
  );
}
