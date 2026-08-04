import type { TrackAFinding } from "@/lib/critique/types";
import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";

/**
 * Typography analyzer: clusters text-line heights into distinct type
 * sizes. A design with many ungoverned type sizes (no modular scale) is a
 * reliable amateur tell — professional type systems typically use 3-5
 * sizes. Port of `services/analyzer/analyzers/typography.py`.
 */
const EXPECTED_DISTINCT_SIZES: [number, number] = [2.0, 5.0];
const CLUSTER_TOLERANCE_PX = 3;

function clusterHeights(heights: number[]): number[] {
  if (heights.length === 0) return [];
  const sorted = [...heights].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const h = sorted[i];
    const last = clusters[clusters.length - 1];
    if (h - last[last.length - 1] <= CLUSTER_TOLERANCE_PX) {
      last.push(h);
    } else {
      clusters.push([h]);
    }
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

export function analyzeTypography(textLines: TextLine[]): TrackAFinding[] {
  if (textLines.length < 3) return [];

  const heights = textLines.map((r) => r.bbox[3]);
  const clusters = clusterHeights(heights);
  const nSizes = clusters.length;

  const [lo, hi] = EXPECTED_DISTINCT_SIZES;
  if (nSizes >= lo && nSizes <= hi) return [];

  const xs = textLines.map((r) => r.bbox[0]);
  const ys = textLines.map((r) => r.bbox[1]);
  const x2s = textLines.map((r) => r.bbox[0] + r.bbox[2]);
  const y2s = textLines.map((r) => r.bbox[1] + r.bbox[3]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const unionBbox: [number, number, number, number] = [
    minX,
    minY,
    Math.max(...x2s) - minX,
    Math.max(...y2s) - minY,
  ];

  return [
    {
      id: newFindingId(),
      dimension: "typography",
      severity: nSizes > hi + 3 ? "major" : "minor",
      bbox: unionBbox,
      measured: { value: nSizes, expected: EXPECTED_DISTINCT_SIZES, unit: " distinct sizes" },
    },
  ];
}
