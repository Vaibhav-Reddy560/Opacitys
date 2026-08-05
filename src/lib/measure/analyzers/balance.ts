import { newFindingId } from "../id";
import { SKIPPED, measured, type AnalyzerResult } from "./_result";

/**
 * Balance analyzer: visual weight centroid versus the geometric canvas
 * center. Symmetric/centered designs can be intentional — only a large,
 * likely-unintentional offset is flagged. Weight is
 * |luminance - background luminance|, not gradient magnitude, since a
 * large solid block's interior (exactly the kind of element that visually
 * dominates a layout) has almost no edge signal but a strong deviation from
 * the background. Port of `services/analyzer/analyzers/balance.py`.
 */
const EXPECTED_OFFSET_FRAC: [number, number] = [0.0, 0.2];

export function analyzeBalance(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): AnalyzerResult {
  const sorted = Float32Array.from(gray).sort();
  const background = sorted[Math.floor(sorted.length / 2)];

  let total = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = Math.abs(gray[y * width + x] - background);
      total += w;
      sumX += x * w;
      sumY += y * w;
    }
  }
  if (total <= 0) return SKIPPED;

  const cx = sumX / total;
  const cy = sumY / total;
  const centerX = width / 2;
  const centerY = height / 2;
  const offset = Math.hypot(cx - centerX, cy - centerY);
  const halfDiag = Math.hypot(width, height) / 2;
  const offsetFrac = halfDiag > 0 ? offset / halfDiag : 0;

  const [lo, hi] = EXPECTED_OFFSET_FRAC;
  if (offsetFrac <= hi) return measured();

  const boxSize = Math.min(width, height) * 0.15;
  const bbox: [number, number, number, number] = [
    Math.max(0, cx - boxSize / 2),
    Math.max(0, cy - boxSize / 2),
    boxSize,
    boxSize,
  ];

  return measured([
    {
      id: newFindingId(),
      dimension: "balance",
      severity: offsetFrac > hi * 1.5 ? "major" : "minor",
      bbox,
      measured: { value: Math.round(offsetFrac * 100) / 100, expected: [lo, hi], unit: " centroid offset" },
    },
  ]);
}
