"use client";

import { useEffect, useRef, useState } from "react";
import { buildGlyphField } from "./distance-transform";
import { rasterizeWordmark } from "./rasterize";
import type { GlyphField, SdfRequest, SdfResponse } from "./types";

export type GlyphFieldStatus = "idle" | "building" | "ready" | "failed";

export interface UseGlyphFieldResult {
  field: GlyphField | null;
  status: GlyphFieldStatus;
}

export interface UseGlyphFieldArgs {
  /**
   * Element whose computed font-family/size/letter-spacing drives the
   * raster. The caller must apply the *same* className (and
   * `fontFamily: var(--font-wordmark)`) used for the SVG `<Wordmark>` to
   * this node, so `getComputedStyle` reflects the exact same layout — that
   * is what keeps the glass render and the SVG fallback aligned enough for
   * a clean A/B swap.
   */
  hostRef: React.RefObject<HTMLElement | null>;
  text: string;
  /** GPU MAX_TEXTURE_SIZE once known (from the WebGL context) — caps the raster so it can never exceed it. */
  maxTextureSize?: number;
  enabled: boolean;
}

const RESIZE_DEBOUNCE_MS = 180;
const MODULE_CACHE = new Map<string, GlyphField>();

function cacheKey(text: string, fontSizeCss: number, trackingCss: string, scale: number, family: string): string {
  return `${text}|${Math.round(fontSizeCss)}|${trackingCss}|${scale.toFixed(2)}|${family}`;
}

/**
 * One worker for the whole app, lazily created. Every `useGlyphField`
 * instance (the hero, the lab page) shares it — SDF builds are bursty, not
 * continuous, so a pool is unnecessary; `requestId` correlation (below) is
 * what makes sharing safe under concurrent builds.
 */
let sharedWorker: Worker | null | undefined; // undefined = not yet tried, null = unavailable
let requestSeq = 0;
const pending = new Map<number, (response: SdfResponse) => void>();

function getWorker(): Worker | null {
  if (sharedWorker !== undefined) return sharedWorker;
  try {
    sharedWorker = new Worker(new URL("./sdf.worker.ts", import.meta.url), { type: "module" });
    sharedWorker.addEventListener("message", (e: MessageEvent<SdfResponse>) => {
      const resolve = pending.get(e.data.requestId);
      if (resolve) {
        pending.delete(e.data.requestId);
        resolve(e.data);
      }
    });
    sharedWorker.addEventListener("error", () => {
      // A worker-level error (not caught inside buildGlyphFieldResponse)
      // leaves any in-flight requests unresolved. Each caller has its own
      // timeout fallback below, so just drop the dead worker so the next
      // build attempt goes straight to the inline path.
      sharedWorker = null;
    });
  } catch {
    sharedWorker = null;
  }
  return sharedWorker;
}

/** Resolves with the worker's response, or rejects after a timeout so a wedged worker can't hang a build forever. */
function buildOnWorker(worker: Worker, request: SdfRequest, timeoutMs = 4000): Promise<SdfResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request.requestId);
      reject(new Error("SDF worker timed out"));
    }, timeoutMs);
    pending.set(request.requestId, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
    worker.postMessage(request, [request.alpha.buffer]);
  });
}

/**
 * Font -> raster -> (worker | inline) SDF build -> packed texture, cached
 * and debounced. See `rasterize.ts` and `distance-transform.ts` for the
 * pipeline itself; this hook only owns timing, caching, and the
 * worker/inline fallback choice.
 */
export function useGlyphField({ hostRef, text, maxTextureSize, enabled }: UseGlyphFieldArgs): UseGlyphFieldResult {
  const [result, setResult] = useState<UseGlyphFieldResult>({ field: null, status: "idle" });
  const activeSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const build = async () => {
      const cs = getComputedStyle(host);
      const fontSizeCss = parseFloat(cs.fontSize) || 16;
      const trackingCss = cs.letterSpacing;
      const family = cs.fontFamily;
      const weight = cs.fontWeight;

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const supersample: 1 | 2 = 2;
      const cssWidth = host.getBoundingClientRect().width || fontSizeCss * text.length * 0.65;
      const padCssGuess = Math.max(24, fontSizeCss * 0.22);
      const totalCssWidth = cssWidth + padCssGuess * 2;

      const dprCap = maxTextureSize ? Math.min(2, maxTextureSize / (totalCssWidth * supersample)) : 2;
      const effectiveDpr = Math.max(0.5, Math.min(dpr, dprCap));
      const scale = effectiveDpr * supersample;

      const key = cacheKey(text, fontSizeCss, trackingCss, scale, family);
      const cached = MODULE_CACHE.get(key);
      if (cached) {
        if (!cancelled) setResult({ field: cached, status: "ready" });
        return;
      }

      if (!cancelled) setResult((prev) => (prev.status === "ready" ? prev : { ...prev, status: "building" }));

      const mySeq = ++activeSeqRef.current;

      let raster;
      try {
        raster = await rasterizeWordmark({
          text,
          computedFontFamily: family,
          computedFontWeight: weight,
          fontSizeCss,
          letterSpacingCss: trackingCss,
          scale,
          supersample,
        });
      } catch {
        if (!cancelled && activeSeqRef.current === mySeq) setResult({ field: null, status: "failed" });
        return;
      }

      if (cancelled || activeSeqRef.current !== mySeq) return;
      if (!raster.fontVerified) {
        // Never ship a glass render of a generic fallback face — the SVG
        // <Wordmark> takes over instead (see WordmarkGlass's fallback gate).
        setResult({ field: null, status: "failed" });
        return;
      }

      const request: SdfRequest = {
        requestId: ++requestSeq,
        alpha: raster.alpha,
        width: raster.width,
        height: raster.height,
        padDevice: raster.padDevice,
        padCss: raster.padCss,
        inkWidthCss: raster.inkWidthCss,
        inkHeightCss: raster.inkHeightCss,
        supersample: raster.supersample,
        fontSizeDevice: raster.fontSizeDevice,
      };

      const finish = (field: GlyphField) => {
        if (cancelled || activeSeqRef.current !== mySeq) return;
        MODULE_CACHE.set(key, field);
        setResult({ field, status: "ready" });
      };

      const worker = getWorker();
      if (worker) {
        try {
          const response = await buildOnWorker(worker, request);
          finish(response);
          return;
        } catch {
          // Wedged/unavailable worker — fall through to the inline path
          // below rather than fail the build outright.
        }
      }

      // No worker, or it timed out: build inline. Costs up to ~900ms at hero
      // size on the main thread — acceptable as a fallback, not the common
      // case, and still faster than showing nothing.
      finish(buildGlyphField(request));
    };

    const scheduleBuild = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void build();
      }, RESIZE_DEBOUNCE_MS);
    };

    void build();
    const ro = new ResizeObserver(scheduleBuild);
    ro.observe(host);
    document.fonts?.ready.then(() => {
      if (!cancelled) scheduleBuild();
    }).catch(() => {});

    return () => {
      // `cancelled` alone covers unmount / effect re-run (each has its own
      // closure). `activeSeqRef` is bumped per-build, at the top of `build()`
      // — it's what lets a *newer* build within the same effect instance
      // (triggered by ResizeObserver or fonts.ready, not remount) supersede
      // an older in-flight one; nothing to do with it here.
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      ro.disconnect();
    };
  }, [hostRef, text, maxTextureSize, enabled]);

  return result;
}
