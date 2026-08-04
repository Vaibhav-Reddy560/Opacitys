import type { TrackAFinding } from "@/lib/critique/types";
import type { Box } from "../ops";
import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";
import { selectBoxes } from "./_boxes";

/**
 * Spacing analyzer: gap consistency between adjacent content blocks. Real
 * grid systems keep gaps on a rhythm; wildly uneven gaps read as
 * "unintentional" even to viewers who can't say why. Port of
 * `services/analyzer/analyzers/spacing.py`.
 */
const EXPECTED_CV: [number, number] = [0.0, 0.5]; // std/mean of gaps

function nearestGap(box: Box, others: Box[]): number | null {
  let best: number | null = null;
  for (const o of others) {
    const dx = Math.max(o.x - (box.x + box.w), box.x - (o.x + o.w), 0);
    const dy = Math.max(o.y - (box.y + box.h), box.y - (o.y + o.h), 0);
    const gap = dx > dy ? dx : dy;
    if (gap <= 0) continue;
    if (best === null || gap < best) best = gap;
  }
  return best;
}

export function analyzeSpacing(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  textLines: TextLine[],
): TrackAFinding[] {
  const boxes = selectBoxes(gray, width, height, textLines);
  if (boxes.length < 4) return [];

  const gaps: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const others = boxes.filter((_, j) => j !== i);
    const g = nearestGap(boxes[i], others);
    if (g !== null) gaps.push(g);
  }
  if (gaps.length < 3) return [];

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  const [lo, hi] = EXPECTED_CV;
  if (cv <= hi) return [];

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

  return [
    {
      id: newFindingId(),
      dimension: "spacing",
      severity: cv > hi * 2 ? "major" : "minor",
      bbox: unionBbox,
      measured: { value: Math.round(cv * 100) / 100, expected: [lo, hi], unit: " gap variation (CV)" },
    },
  ];
}
