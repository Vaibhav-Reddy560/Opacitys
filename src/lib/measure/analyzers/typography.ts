import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";
import { SKIPPED, measured, type AnalyzerResult } from "./_result";
import { clusterTextLines } from "./_type-clusters";

/**
 * Typography analyzer: clusters text-line heights into distinct type
 * sizes. A design with many ungoverned type sizes (no modular scale) is a
 * reliable amateur tell — professional type systems typically use 3-5
 * sizes. Port of `services/analyzer/analyzers/typography.py`.
 */
const EXPECTED_DISTINCT_SIZES: [number, number] = [2.0, 5.0];

export function analyzeTypography(textLines: TextLine[]): AnalyzerResult {
  if (textLines.length < 3) return SKIPPED;

  const nSizes = clusterTextLines(textLines).length;

  const [lo, hi] = EXPECTED_DISTINCT_SIZES;
  if (nSizes >= lo && nSizes <= hi) return measured();

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

  return measured([
    {
      id: newFindingId(),
      dimension: "typography",
      severity: nSizes > hi + 3 ? "major" : "minor",
      bbox: unionBbox,
      measured: { value: nSizes, expected: EXPECTED_DISTINCT_SIZES, unit: " distinct sizes" },
    },
  ]);
}
