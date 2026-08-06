import type { DecodedImage } from "@/lib/measure/image";
import { quantizeImage, type Palette } from "./quantize";
import { layeringStep } from "./layering";
import { pathScan, type ScanPoint } from "./pathscan";
import { internodes, tracePath, type Segment } from "./fit";

export type { Segment } from "./fit";
export type { Palette } from "./quantize";

export interface TracedPath {
  layerIndex: number;
  color: [number, number, number];
  /** x, y, w, h — WORKING image pixel space (same space as `decoded.rgb`), NOT source space. See the module doc comment for why. */
  bbox: [number, number, number, number];
  area: number;
  isHole: boolean;
  /** Indices into the SAME returned array — global, not per-layer. */
  holeChildren: number[];
  segments: Segment[];
  /** Pre-fit boundary polyline, working-image pixel space — the decompose stage's corner-spectrum and feature math reads this, not `segments`, to avoid the fitter's own bias. */
  points: Array<{ x: number; y: number }>;
}

export interface TraceOptions {
  /** Max palette size for color quantization. */
  paletteSize?: number;
  /** Squared-distance error tolerance for the straight-line fit. */
  ltres?: number;
  /** Squared-distance error tolerance for the quadratic fit. */
  qtres?: number;
  /** Discard closed paths shorter than this many boundary points — the pathscan-level noise floor, working-image pixel units. */
  pathomit?: number;
  rightAngleEnhance?: boolean;
}

const DEFAULTS: Required<TraceOptions> = {
  paletteSize: 16,
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  rightAngleEnhance: true,
};

/** Shoelace formula on the raw boundary walk — used for area before any curve fitting rounds it off. */
function polygonArea(points: ScanPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * The full trace pipeline for a decoded image: quantize to a small palette
 * (this repo's own kmeans2, not ImageTracer's), then per color: marching-
 * squares layering -> pathscan -> internode interpolation -> line/quadratic
 * fitting.
 *
 * Geometry is returned in WORKING image pixel space (decoded.width/height,
 * capped at MAX_WORKING_EDGE=1600 by decodeForMeasurement) — deliberately
 * NOT projected to source coordinates here. Every decompose stage after
 * this one rasterizes paths into pixel-ownership/adjacency arrays, and
 * doing that at unbounded source resolution (a 6000px camera photo would
 * mean a 100MB+ raster for zero accuracy gain, since the trace itself
 * already ran on the downscaled image) would be pure waste. Source-space
 * projection happens exactly once, at the very end of the whole rebuild
 * pipeline when DesignElement geometry is persisted — the same convention
 * measure/index.ts uses for finding bboxes.
 */
export function traceImage(decoded: DecodedImage, opts: TraceOptions = {}): { paths: TracedPath[]; palette: Palette[] } {
  const options = { ...DEFAULTS, ...opts };
  const { rgb, width, height } = decoded;

  const { indexed, stride, rows, palette } = quantizeImage(rgb, width, height, options.paletteSize);

  const allPaths: TracedPath[] = [];

  for (let colorIndex = 0; colorIndex < palette.length; colorIndex++) {
    const layer = layeringStep(indexed, stride, rows, colorIndex);
    const scanPaths = pathScan(layer, stride, rows, options.pathomit);
    if (scanPaths.length === 0) continue;

    const base = allPaths.length;
    const p = palette[colorIndex];

    scanPaths.forEach((sp) => {
      const inter = internodes(sp, options.rightAngleEnhance);
      const traced = tracePath(inter, options.ltres, options.qtres);
      const [minX, minY, maxX, maxY] = traced.boundingBox;

      allPaths.push({
        layerIndex: colorIndex,
        color: [p.r, p.g, p.b],
        bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1],
        area: polygonArea(sp.points),
        isHole: traced.isHole,
        holeChildren: traced.holeChildren.map((h) => base + h),
        segments: traced.segments,
        points: sp.points.map((pt) => ({ x: pt.x, y: pt.y })),
      });
    });
  }

  return { paths: allPaths, palette };
}
