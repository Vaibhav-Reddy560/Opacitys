import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";
import { SKIPPED, measured, type AnalyzerResult } from "./_result";
import { clusterTextLines, type TypeCluster } from "./_type-clusters";

/**
 * Contrast analyzer: does the display size announce itself decisively
 * against the body size? Robin Williams, The Non-Designer's Design Book:
 * "If two elements are not exactly the same, make them vastly different" —
 * and near-identical type sizes are exactly the "conflicting… ugly" case
 * that book calls out.
 *
 * This is not `color` (WCAG legibility of ink against its local background)
 * or `typography` (*how many* sizes exist) — it's *how far apart* the
 * extremes sit. A design can pass typography (a sane 3-5 sizes) and still
 * fail this if the largest is barely bigger than the smallest.
 *
 * Comparing the most-populous cluster (body) against the tallest cluster
 * (display) — not adjacent clusters — deliberately, because
 * CLUSTER_TOLERANCE_PX=3 on a 1600px working image means ascender/descender
 * jitter alone produces adjacent clusters ~1.1x apart on entirely ordinary
 * body copy; that would false-positive on the majority of uploads.
 */
const EXPECTED_TYPE_CONTRAST: [number, number] = [1.5, 8.0]; // only `lo` is enforced — an 8x hero
// word is a legitimate design choice, not a defect; `hi` only exists so the
// UI's "safe 1.5-8x" readout has a sensible upper bound to display.

function unionBbox(lines: TextLine[]): [number, number, number, number] {
  const xs = lines.map((l) => l.bbox[0]);
  const ys = lines.map((l) => l.bbox[1]);
  const x2s = lines.map((l) => l.bbox[0] + l.bbox[2]);
  const y2s = lines.map((l) => l.bbox[1] + l.bbox[3]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...x2s) - minX, Math.max(...y2s) - minY];
}

export function analyzeContrast(textLines: TextLine[]): AnalyzerResult {
  if (textLines.length < 4) return SKIPPED; // need enough lines for a believable "body"

  const clusters = clusterTextLines(textLines);
  if (clusters.length < 2) return SKIPPED; // one size — typography's call, not this dimension's

  const body = clusters.reduce((a: TypeCluster, b: TypeCluster) =>
    b.lines.length > a.lines.length ? b : a,
  );
  const display = clusters.reduce((a: TypeCluster, b: TypeCluster) =>
    b.meanHeight > a.meanHeight ? b : a,
  );
  if (body === display) return SKIPPED; // the biggest cluster IS the body — no display size to judge
  if (body.lines.length < 2) return SKIPPED; // one stray line isn't a body

  const ratio = display.meanHeight / body.meanHeight;
  const [lo, hi] = EXPECTED_TYPE_CONTRAST;
  if (ratio >= lo) return measured();

  return measured([
    {
      id: newFindingId(),
      dimension: "contrast",
      severity: ratio < 1.2 ? "major" : "minor",
      bbox: unionBbox(display.lines), // the heading that fails to announce itself
      measured: { value: Math.round(ratio * 100) / 100, expected: [lo, hi], unit: "x size step" },
    },
  ]);
}
