import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";
import { selectBoxes } from "./_boxes";
import { SKIPPED, measured, type AnalyzerResult } from "./_result";

/**
 * Layout analyzer: how many detected content blocks actually share an edge
 * (left/right/top) with another block, within tolerance. Low alignment
 * ratio is a concrete, measurable "things don't line up" signal. Port of
 * `services/analyzer/analyzers/layout.py`.
 */
const TOLERANCE_FRAC = 0.01;
const EXPECTED_ALIGNMENT_RATIO: [number, number] = [0.6, 1.0];

function edgesAligned(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

export function analyzeLayout(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  textLines: TextLine[],
): AnalyzerResult {
  const boxes = selectBoxes(gray, width, height, textLines);
  if (boxes.length < 3) return SKIPPED;

  const tolX = TOLERANCE_FRAC * width;
  const tolY = TOLERANCE_FRAC * height;

  let alignedCount = 0;
  for (let i = 0; i < boxes.length; i++) {
    const { x, y, w } = boxes[i];
    let hasPartner = false;
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const o = boxes[j];
      if (
        edgesAligned(x, o.x, tolX) ||
        edgesAligned(x + w, o.x + o.w, tolX) ||
        edgesAligned(y, o.y, tolY)
      ) {
        hasPartner = true;
        break;
      }
    }
    if (hasPartner) alignedCount++;
  }

  const ratio = alignedCount / boxes.length;
  const [lo, hi] = EXPECTED_ALIGNMENT_RATIO;
  if (ratio >= lo) return measured();

  const xs = boxes.map((b) => b.x);
  const ys = boxes.map((b) => b.y);
  const x2s = boxes.map((b) => b.x + b.w);
  const y2s = boxes.map((b) => b.y + b.h);
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
      dimension: "layout",
      severity: ratio < lo * 0.5 ? "critical" : "major",
      bbox: unionBbox,
      measured: { value: Math.round(ratio * 100) / 100, expected: [lo, hi], unit: " alignment ratio" },
    },
  ]);
}
