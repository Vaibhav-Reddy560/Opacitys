import type { Segment } from "./fit";

/**
 * Adapted from ImageTracer.js's svgpathstring() (Unlicense / public domain
 * — see pathscan.ts's attribution note), split into three small pure
 * functions instead of one string-builder that walks a whole tracedata
 * object: rebuild's DesignElement can own several disjoint outer subpaths
 * (a same-layer merge, an icon group), each with its own holes, so the
 * assembly needs to be composable rather than fixed to "one layer, one
 * path" like the original.
 */

function roundTo(v: number, places: number): number {
  return +v.toFixed(places);
}

function fmt(v: number, scale: number, roundcoords: number): string {
  return String(roundcoords < 0 ? v * scale : roundTo(v * scale, roundcoords));
}

/** 'd' fragment for one outer subpath, forward winding: "M x y L x y ... Z ". */
export function outerPathD(segments: Segment[], scale = 1, roundcoords = 1): string {
  if (segments.length === 0) return "";
  let d = `M ${fmt(segments[0].x1, scale, roundcoords)} ${fmt(segments[0].y1, scale, roundcoords)} `;
  for (const seg of segments) {
    d += `${seg.type} ${fmt(seg.x2, scale, roundcoords)} ${fmt(seg.y2, scale, roundcoords)} `;
    if (seg.type === "Q") d += `${fmt(seg.x3, scale, roundcoords)} ${fmt(seg.y3, scale, roundcoords)} `;
  }
  return `${d}Z `;
}

/**
 * 'd' fragment for a hole subpath, walked and wound in REVERSE of its own
 * boundary — combined with the outer subpath's forward winding, a plain
 * nonzero fill-rule renders it as a hole with no extra SVG attribute
 * needed. Exactly ImageTracer's own trick, ported as-is.
 */
export function holePathD(segments: Segment[], scale = 1, roundcoords = 1): string {
  if (segments.length === 0) return "";
  const last = segments[segments.length - 1];
  const startX = last.type === "Q" ? last.x3 : last.x2;
  const startY = last.type === "Q" ? last.y3 : last.y2;
  let d = `M ${fmt(startX, scale, roundcoords)} ${fmt(startY, scale, roundcoords)} `;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    d += `${seg.type} `;
    if (seg.type === "Q") d += `${fmt(seg.x2, scale, roundcoords)} ${fmt(seg.y2, scale, roundcoords)} `;
    d += `${fmt(seg.x1, scale, roundcoords)} ${fmt(seg.y1, scale, roundcoords)} `;
  }
  return `${d}Z `;
}

/** Full 'd' attribute value for one shape: its outer boundary plus every hole. */
export function pathToD(outer: Segment[], holes: Segment[][], scale = 1, roundcoords = 1): string {
  let d = outerPathD(outer, scale, roundcoords);
  for (const h of holes) d += holePathD(h, scale, roundcoords);
  return d.trim();
}
