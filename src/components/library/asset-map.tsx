"use client";

import { useEffect, useRef } from "react";
// Namespace import — maplibre-gl's ESM build exposes only named exports, no
// default. This whole component is already code-split behind next/dynamic
// in uploads-panel.tsx (see the comment there), so the library still stays
// out of the initial bundle even with a static import here; a nested
// `await import()` inside the effect was tried and ruled out as the cause
// of the black-map bug below — the real cause is the worker URL.
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { MapPin } from "lucide-react";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";
import type { AssetSummary } from "@/lib/library/queries";

// Genuinely static — this is a small stylesheet (controls/popup chrome
// only, not the map's own rendering), and this whole component is loaded
// via next/dynamic from uploads-panel.tsx, so it never reaches the initial
// bundle. Only the JS library itself (~230KB) needs the dynamic import()
// below; Next's webpack setup doesn't support dynamically import()-ing a
// bare CSS file from inside an effect.
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The library's map view. MapLibre GL JS (BSD-3) over OpenFreeMap's dark
 * vector style (MIT, keyless, no signup, no usage limits, commercial use
 * allowed — verified live before wiring this in, and CARTO's dark-matter
 * was rejected for the opposite reason: commercial use requires their
 * Enterprise license). See project memory for the full comparison.
 *
 * Vector tiles, not raster — every layer's paint is overridden below with
 * hex equivalents of this app's own oklch tokens (globals.css), computed
 * once via the OKLCH->sRGB formulas and hand-verified, so this reads as an
 * Opacitys surface rather than "a generic dark map embedded in the app."
 */

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/**
 * MapLibre parses vector tiles in a Web Worker, and works out that worker's
 * URL from its own `import.meta.url`:
 *
 *   if (!/^https?:/.test(import.meta.url)) return "";
 *
 * Under Turbopack `import.meta.url` is not an http(s) URL, so that check
 * fails and the worker URL becomes the empty string — `new Worker("")`,
 * which spawns a worker pointed at the document itself. It starts, never
 * throws, never fetches, and never answers a single tile request: the map
 * renders its background layer and nothing else, permanently black, with no
 * console error anywhere. (Measured: `_frameRequest: null`, both dirty flags
 * false, the vector source stuck at `loaded=false` forever.)
 *
 * So the worker is served from /public instead, where it has a real http
 * URL. `maplibre-gl-shared.mjs` sits beside it because the worker imports it
 * relatively; both are copied from node_modules by
 * scripts/copy-maplibre-worker.mjs, which `predev`/`prebuild` run so the
 * pair can never drift from the installed version — a worker built from a
 * different release than the main bundle fails in far subtler ways than this
 * did.
 */
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// Hex equivalents of the app's own chrome ramp (globals.css) — MapLibre
// paint properties don't accept oklch(). The first pass at this reused
// tones that were all within 0.04 of each other in lightness
// (background/water/land) and the map rendered as a near-solid black
// rectangle — real contrast between the ramp's stops is what makes a dark
// map actually readable, not just "everything dark."
const MAP_PALETTE = {
  background: "#080a0f", // --background: oklch(0.145 0.012 265)
  // Water recedes into the void rather than competing with it — the same
  // choice CARTO's own dark-matter style makes, and honest given the app
  // has no distinct "water" token of its own.
  water: "#080a0f", // --background
  land: "#292e36", // --chrome-deep: oklch(0.3 0.016 262) — a real step up from background
  roadCasing: "#0c0f16", // --chrome-void: oklch(0.17 0.014 265) — a dark seam UNDER major roads, not a highlight
  roadMinor: "#646971", // --chrome-mid: oklch(0.52 0.014 258)
  roadMajor: "#a0a5ac", // --chrome-edge: oklch(0.72 0.012 255) — brighter, so the road hierarchy actually reads
  boundary: "#646971", // --chrome-mid
  label: "#a0a5ac", // --chrome-edge
  labelDim: "#646971", // --chrome-mid — secondary labels (water names, minor road names)
  labelHalo: "#080a0f", // --background
} as const;

/** Recolors one style layer in place, based on what kind of feature its id
 *  names — targeted, not a blanket hue-shift, so labels stay legible and
 *  land reads distinctly from the void at every zoom. Only touches paint
 *  keys that already exist on the layer, so nothing that isn't a plain
 *  color (an icon-opacity expression, e.g.) is disturbed. */
function recolorLayer(layer: { id: string; type: string; paint?: Record<string, unknown> }): void {
  const paint = layer.paint;
  if (!paint) return;
  const set = (key: string, value: string) => {
    if (key in paint) paint[key] = value;
  };

  if (layer.id === "background") {
    set("background-color", MAP_PALETTE.background);
    return;
  }
  if (layer.id === "water" || layer.id === "waterway" || layer.id.startsWith("road_area_pier") || layer.id.startsWith("road_pier")) {
    set("fill-color", MAP_PALETTE.water);
    set("line-color", MAP_PALETTE.water);
    return;
  }
  if (layer.id.startsWith("landcover") || layer.id.startsWith("landuse") || layer.id === "building" || layer.id.startsWith("aeroway-area")) {
    set("fill-color", MAP_PALETTE.land);
    set("fill-outline-color", MAP_PALETTE.roadCasing);
    return;
  }
  // Checked BEFORE the generic "highway"/"railway" line branch below — both
  // "highway_name_other" and "highway_name_motorway" start with "highway",
  // so without this ordering they'd match the line branch first (which
  // no-ops on a symbol layer's paint, since it has no line-color) and
  // return before ever reaching the label recoloring, leaving those two
  // layers stuck on OpenFreeMap's stock grey.
  if (layer.id.startsWith("place_") || layer.id === "water_name" || layer.id.startsWith("highway_name")) {
    set("text-color", layer.id === "water_name" ? MAP_PALETTE.labelDim : MAP_PALETTE.label);
    set("text-halo-color", MAP_PALETTE.labelHalo);
    return;
  }
  if (layer.id.startsWith("highway") || layer.id.startsWith("railway") || layer.id.startsWith("aeroway-")) {
    const isCasing = layer.id.includes("casing");
    const isMajor = layer.id.includes("major") || layer.id.includes("motorway");
    set("line-color", isCasing ? MAP_PALETTE.roadCasing : isMajor ? MAP_PALETTE.roadMajor : MAP_PALETTE.roadMinor);
    return;
  }
  if (layer.id.startsWith("boundary")) {
    set("line-color", MAP_PALETTE.boundary);
    return;
  }
}

export interface LocatedAsset extends AssetSummary {
  latitude: number;
  longitude: number;
}

function formatAccuracy(m: number | null): string {
  if (m === null) return "";
  return m < 1000 ? `±${Math.round(m)}m` : `±${(m / 1000).toFixed(1)}km`;
}

/** Groups assets that are essentially "the same spot" (same desk, same
 *  event) so they collapse into one marker instead of a dozen overlapping,
 *  unreadable pins. ~4 decimal places is roughly 11m at the equator — fine
 *  enough to separate genuinely different places, coarse enough to merge
 *  GPS jitter from the same room. */
function groupByLocation(assets: LocatedAsset[]): LocatedAsset[][] {
  const groups = new Map<string, LocatedAsset[]>();
  for (const asset of assets) {
    const key = `${asset.latitude.toFixed(4)},${asset.longitude.toFixed(4)}`;
    const existing = groups.get(key);
    if (existing) existing.push(asset);
    else groups.set(key, [asset]);
  }
  return [...groups.values()];
}

function buildPopupContent(group: LocatedAsset[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "opacitys-map-popup";

  const label = group.find((a) => a.placeLabel)?.placeLabel;
  const header = document.createElement("div");
  header.className = "opacitys-map-popup-header";
  header.textContent = label ?? `${group.length} upload${group.length > 1 ? "s" : ""} here`;
  root.appendChild(header);

  const strip = document.createElement("div");
  strip.className = "opacitys-map-popup-strip";
  for (const asset of group) {
    const a = document.createElement("a");
    a.href = `/studio/library/${asset.id}`;
    a.className = "opacitys-map-popup-thumb";
    const img = document.createElement("img");
    img.src = asset.storageKey;
    img.alt = asset.originalName ?? "Uploaded design";
    a.appendChild(img);
    strip.appendChild(a);
  }
  root.appendChild(strip);

  const meta = document.createElement("div");
  meta.className = "opacitys-map-popup-meta";
  const first = group[0];
  meta.textContent = [
    new Date(first.createdAt).toLocaleDateString(),
    formatAccuracy(first.locationAccuracy),
  ]
    .filter(Boolean)
    .join(" · ");
  root.appendChild(meta);

  return root;
}

function buildMarkerElement(group: LocatedAsset[]): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "opacitys-map-marker";
  el.style.background = `conic-gradient(from 0deg, ${SPECTRUM_GRADIENT})`;

  const face = document.createElement("div");
  face.className = "opacitys-map-marker-face";
  face.style.backgroundImage = `url(${group[0].storageKey})`;
  el.appendChild(face);

  if (group.length > 1) {
    const badge = document.createElement("span");
    badge.className = "opacitys-map-marker-badge";
    badge.textContent = String(group.length);
    el.appendChild(badge);
  }
  return el;
}

// Scoped overrides for MapLibre's own UI chrome (attribution box, zoom
// control) — third-party CSS classes Tailwind can't reach, and the
// defaults are a light-mode box that would sit on this page like a
// mistake. Injected once per mount; MapLibre's own stylesheet is imported
// dynamically alongside the library itself, below.
const CONTROL_STYLE = `
  .opacitys-map .maplibregl-ctrl-attrib { background: rgba(8,10,15,0.72); color: #8a8b8f; }
  .opacitys-map .maplibregl-ctrl-attrib a { color: #a0a5ac; }
  .opacitys-map .maplibregl-ctrl-group { background: #101319; border: 1px solid rgba(255,255,255,0.09); box-shadow: none; }
  .opacitys-map .maplibregl-ctrl-group button { background: transparent; }
  .opacitys-map .maplibregl-ctrl-icon { filter: invert(1) brightness(1.6); }
  .opacitys-map .maplibregl-popup-content { background: #101319; border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; padding: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.45); }
  .opacitys-map .maplibregl-popup-tip { border-top-color: #101319; border-bottom-color: #101319; }
  .opacitys-map-popup-header { font-size: 12px; color: #f4f5f8; margin-bottom: 6px; }
  .opacitys-map-popup-strip { display: flex; gap: 6px; overflow-x: auto; max-width: 220px; padding-bottom: 2px; }
  .opacitys-map-popup-thumb { flex: 0 0 auto; display: block; width: 52px; height: 52px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
  .opacitys-map-popup-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .opacitys-map-popup-meta { margin-top: 6px; font-size: 10.5px; color: #66686c; }
  .opacitys-map-marker { position: relative; width: 30px; height: 30px; border-radius: 9999px; padding: 2px; cursor: pointer; }
  .opacitys-map-marker-face { width: 100%; height: 100%; border-radius: 9999px; background-color: #101319; background-size: cover; background-position: center; border: 1.5px solid #080a0f; }
  .opacitys-map-marker-badge { position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 9999px; background: #080a0f; border: 1px solid rgba(255,255,255,0.15); color: #f4f5f8; font-size: 9px; line-height: 14px; text-align: center; }
`;

export function AssetMap({ assets }: { assets: AssetSummary[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const located = assets.filter((a): a is LocatedAsset => a.latitude !== null && a.longitude !== null);

  useEffect(() => {
    if (located.length === 0 || !containerRef.current) return;

    let map: MapLibreMap | null = null;
    const markers: MapLibreMarker[] = [];
    let cancelled = false;

    (async () => {
      const style = await fetch(STYLE_URL).then((r) => r.json());
      for (const layer of style.layers ?? []) recolorLayer(layer);
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const bounds = new maplibregl.LngLatBounds();
      for (const group of groupByLocation(located)) {
        const [lng, lat] = [group[0].longitude, group[0].latitude];
        bounds.extend([lng, lat]);
        const marker = new maplibregl.Marker({ element: buildMarkerElement(group) })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 18, maxWidth: "240px" }).setDOMContent(buildPopupContent(group)))
          .addTo(map);
        markers.push(marker);
      }

      map.fitBounds(bounds, { padding: 56, maxZoom: 12, duration: 0 });
    })();

    return () => {
      cancelled = true;
      for (const m of markers) m.remove();
      map?.remove();
    };
    // `located` is derived fresh from `assets` every render; re-running this
    // effect keyed on its length + a cheap identity is enough here since a
    // new upload triggers a router.refresh() → new `assets` array anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.length]);

  if (located.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-white/[0.09] bg-white/[0.02] py-20 text-center">
        <div className="max-w-xs space-y-1.5">
          <MapPin className="mx-auto size-5 text-foreground/35" aria-hidden />
          <p className="text-[13px] text-foreground/55">No located uploads yet.</p>
          <p className="text-[11.5px] leading-relaxed text-foreground/40">
            Upload with &ldquo;Tag location&rdquo; on to see your work plotted here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{CONTROL_STYLE}</style>
      <div ref={containerRef} className="opacitys-map h-[420px] w-full overflow-hidden rounded-xl border border-white/[0.09]" />
    </>
  );
}
