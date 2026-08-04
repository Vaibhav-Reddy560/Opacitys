import type { TrackAFinding } from "@/lib/critique/types";
import { spectralResidualSaliency } from "../ops";
import { newFindingId } from "../id";

/**
 * Hierarchy analyzer: does the most visually salient region correspond to
 * where a reader would expect to start (top-left / top-center in most
 * Western layouts)? Uses spectral-residual saliency as a proxy for "what
 * draws the eye first". Port of `services/analyzer/analyzers/hierarchy.py`.
 */
const EXPECTED_TOP_BAND_SHARE: [number, number] = [0.25, 1.0];

export function analyzeHierarchy(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): TrackAFinding[] {
  if (height < 16 || width < 16) return [];

  const salMap = spectralResidualSaliency(gray, width, height);
  let total = 0;
  for (let i = 0; i < salMap.length; i++) total += salMap[i];
  if (total <= 0) return [];

  const topBandH = Math.floor(height * 0.4);
  let topMass = 0;
  for (let y = 0; y < topBandH; y++) {
    for (let x = 0; x < width; x++) topMass += salMap[y * width + x];
  }
  const topShare = topMass / total;

  const [lo, hi] = EXPECTED_TOP_BAND_SHARE;
  if (topShare >= lo) return [];

  // Locate the peak-saliency region (top 2% of values) to report as bbox.
  const sorted = Float32Array.from(salMap).sort();
  const percentileIdx = Math.floor(sorted.length * 0.98);
  const cutoff = sorted[Math.min(sorted.length - 1, percentileIdx)];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (salMap[y * width + x] >= cutoff) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!isFinite(minX)) return [];

  return [
    {
      id: newFindingId(),
      dimension: "hierarchy",
      severity: topShare < lo * 0.5 ? "major" : "minor",
      bbox: [minX, minY, maxX - minX, maxY - minY],
      measured: { value: Math.round(topShare * 100) / 100, expected: [lo, hi], unit: " top-band saliency share" },
    },
  ];
}
