import type { TracedPath, Segment } from "../trace";
import { rasterizePolygonWithHoles } from "./raster";
import { detectTextLinesRelaxed } from "./text-lines-relaxed";
import { CORNER_RESAMPLE_N, CORNER_NMS_WINDOW, CORNER_MIN_ANGLE } from "./constants";
import type { DecomposeContext, PathFeatures, Corner } from "./types";

/** Arc-length approximation for one segment — exact for a line, a standard cheap Bezier estimate for a quadratic (<1% error at design curvatures): (2*chord + sum of control arms) / 3. */
function segmentLength(s: Segment): number {
  if (s.type === "L") return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const chord = Math.hypot(s.x3 - s.x1, s.y3 - s.y1);
  const arm1 = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const arm2 = Math.hypot(s.x3 - s.x2, s.y3 - s.y2);
  return (2 * chord + arm1 + arm2) / 3;
}

function resampleArcLength(points: Array<{ x: number; y: number }>, n: number): Array<{ x: number; y: number }> {
  const m = points.length;
  if (m < 3) return points.slice();

  const cum = new Float64Array(m + 1);
  for (let i = 1; i <= m; i++) {
    const a = points[i - 1];
    const b = points[i % m];
    cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cum[m];
  if (total === 0) return points.slice(0, Math.min(n, m));

  const out: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    let lo = 0;
    let hi = m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(1, lo);
    const segStart = cum[idx - 1];
    const segEnd = cum[idx];
    const t = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
    const a = points[(idx - 1) % m];
    const b = points[idx % m];
    out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }
  return out;
}

/** Resamples the boundary to arc-length-uniform points, measures turning angle at each via a +-3 tangent window, and keeps only local maxima above a noise floor — the shared corner evidence stage 4's rectangle/rounded-rect/triangle/polygon tests all read. */
function computeCorners(points: Array<{ x: number; y: number }>): Corner[] {
  const n = CORNER_RESAMPLE_N;
  if (points.length < 8) return [];
  const rs = resampleArcLength(points, n);

  const turns = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = rs[(i - 3 + n) % n];
    const cur = rs[i];
    const next = rs[(i + 3) % n];
    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turns[i] = Math.abs(d) * (180 / Math.PI);
  }

  const corners: Corner[] = [];
  for (let i = 0; i < n; i++) {
    if (turns[i] <= CORNER_MIN_ANGLE) continue;
    let isMax = true;
    for (let w = -CORNER_NMS_WINDOW; w <= CORNER_NMS_WINDOW; w++) {
      if (w === 0) continue;
      if (turns[(i + w + n) % n] > turns[i]) {
        isMax = false;
        break;
      }
    }
    if (isMax) corners.push({ index: i, angle: turns[i] });
  }
  return corners;
}

function buildAdjacency(pixelOwner: Int32Array, width: number, height: number): Map<number, Map<number, number>> {
  const adj = new Map<number, Map<number, number>>();
  const bump = (a: number, b: number) => {
    let m = adj.get(a);
    if (!m) {
      m = new Map();
      adj.set(a, m);
    }
    m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = pixelOwner[y * width + x];
      if (o < 0) continue;
      if (x + 1 < width) {
        const r = pixelOwner[y * width + x + 1];
        if (r >= 0 && r !== o) {
          bump(o, r);
          bump(r, o);
        }
      }
      if (y + 1 < height) {
        const d = pixelOwner[(y + 1) * width + x];
        if (d >= 0 && d !== o) {
          bump(o, d);
          bump(d, o);
        }
      }
    }
  }
  return adj;
}

/**
 * Stage 0. Builds everything every later stage reads instead of
 * re-rasterizing Bezier segments per stage: a per-pixel ownership raster
 * (only candidate, i.e. non-hole, paths ever own pixels — a hole is carved
 * negative space, and whatever real color sits under it gets its own,
 * separate outer path), per-path features netted against holes, a corner
 * spectrum, a layer adjacency graph, and relaxed text-line boxes.
 */
export function precompute(
  paths: TracedPath[],
  rgb: Uint8ClampedArray,
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): DecomposeContext {
  const canvasArea = width * height;
  const candidates: number[] = [];
  for (let i = 0; i < paths.length; i++) if (!paths[i].isHole) candidates.push(i);

  const pixelOwner = new Int32Array(width * height).fill(-1);
  for (const i of candidates) {
    const p = paths[i];
    const holes = p.holeChildren.map((h) => paths[h].points);
    rasterizePolygonWithHoles(p.points, holes, width, height, (x, y) => {
      pixelOwner[y * width + x] = i;
    });
  }

  const netAreaCounts = new Map<number, number>();
  for (let k = 0; k < pixelOwner.length; k++) {
    const o = pixelOwner[k];
    if (o >= 0) netAreaCounts.set(o, (netAreaCounts.get(o) ?? 0) + 1);
  }

  const features = new Map<number, PathFeatures>();
  const corners = new Map<number, Corner[]>();
  for (const i of candidates) {
    const p = paths[i];
    const [, , bw, bh] = p.bbox;
    const netArea = netAreaCounts.get(i) ?? 0;

    let perimeter = 0;
    let qCount = 0;
    for (const s of p.segments) {
      perimeter += segmentLength(s);
      if (s.type === "Q") qCount++;
    }

    features.set(i, {
      netArea,
      extent: bw * bh > 0 ? netArea / (bw * bh) : 0,
      perimeter,
      areaFrac: netArea / canvasArea,
      aspect: bh > 0 ? bw / bh : 0,
      compactness: perimeter > 0 ? (4 * Math.PI * netArea) / (perimeter * perimeter) : 0,
      qFrac: p.segments.length > 0 ? qCount / p.segments.length : 0,
      strokeWidth: perimeter > 0 ? (2 * netArea) / perimeter : 0,
    });
    corners.set(i, computeCorners(p.points));
  }

  const adjacency = buildAdjacency(pixelOwner, width, height);
  const relaxedTextBoxes = detectTextLinesRelaxed(gray, width, height).map(
    (b): [number, number, number, number] => [b.x, b.y, b.w, b.h],
  );

  return {
    paths,
    width,
    height,
    canvasArea,
    gray,
    rgb,
    pixelOwner,
    candidates,
    features,
    corners,
    adjacency,
    relaxedTextBoxes,
    claimed: new Uint8Array(paths.length),
  };
}
