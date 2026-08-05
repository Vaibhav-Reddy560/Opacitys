import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";
import { SKIPPED, measured, type AnalyzerResult } from "./_result";

/**
 * Rhythm analyzer: do the vertical gaps between text lines snap onto a
 * shared baseline unit? Bringhurst (Elements of Typographic Style) frames
 * typography as a rhythmic art where positive and negative space are in
 * harmony; Müller-Brockmann (Grid Systems) calls the baseline grid what
 * "ensures lines of text… align perfectly, creating visual stability."
 *
 * This is NOT `spacing` (gap coefficient of variation) — and the difference
 * is deliberate, not incidental. `spacing` asks "are all the gaps the same
 * size?" and actively penalises good typography: the sequence
 * 12, 12, 12, 24, 12, 36 (tight leading, a paragraph break, a section
 * break) has CV ≈ 0.55 and gets flagged by `spacing`, yet it's a *perfect*
 * 12px baseline grid. `rhythm` asks the orthogonal question — are the gaps
 * integer multiples of one shared unit? A design can pass either measure
 * and fail the other.
 *
 * Baseline proxy is each line's BOTTOM edge, not top: ascenders and caps
 * push the top edge around on nearly every line, where descenders (g j p
 * q y) affect only a minority — bottom is both more stable and literally
 * closer to the typographic baseline the grid is defined on.
 */
const EXPECTED_BASELINE_SNAP: [number, number] = [0.75, 1.0];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function analyzeRhythm(textLines: TextLine[]): AnalyzerResult {
  if (textLines.length < 6) return SKIPPED;

  const withBaseline = textLines
    .map((l) => ({ line: l, baseline: l.bbox[1] + l.bbox[3] }))
    .sort((a, b) => a.baseline - b.baseline);
  const medianH = median(textLines.map((l) => l.bbox[3]));

  // Lines sharing a row (multi-column layouts, label/value pairs) produce
  // ~0 deltas that say nothing about vertical rhythm — drop them.
  const deltas: { value: number; from: TextLine; to: TextLine }[] = [];
  for (let i = 1; i < withBaseline.length; i++) {
    const d = withBaseline[i].baseline - withBaseline[i - 1].baseline;
    if (d >= 0.5 * medianH) {
      deltas.push({ value: d, from: withBaseline[i - 1].line, to: withBaseline[i].line });
    }
  }
  if (deltas.length < 4) return SKIPPED;

  // Bounded search for the unit most deltas snap to. uMin keeps the unit
  // large enough that snapping isn't trivial; uMax keeps it from exceeding
  // the typical line advance. tol = max(2, 0.12u) keeps the per-unit
  // "chance hit rate" (2*tol/u) at or below ~0.33 across the whole search
  // range, which is what makes 0.75 a real threshold rather than noise.
  const medD = median(deltas.map((d) => d.value));
  const uMin = Math.max(12, Math.round(0.45 * medD));
  const uMax = Math.max(uMin, Math.round(1.15 * medD));

  let bestU = uMin;
  let bestHits = -1;
  for (let u = uMin; u <= uMax; u++) {
    const tol = Math.max(2, 0.12 * u);
    let hits = 0;
    for (const d of deltas) {
      const m = Math.round(d.value / u);
      if (m >= 1 && Math.abs(d.value - m * u) <= tol) hits++;
    }
    // >= biases toward the LARGER unit that explains the data, so a
    // trivially small unit (which fits almost anything) doesn't win ties.
    if (hits >= bestHits) {
      bestHits = hits;
      bestU = u;
    }
  }

  const snap = bestHits / deltas.length;
  const [lo, hi] = EXPECTED_BASELINE_SNAP;
  if (snap >= lo) return measured();

  const tol = Math.max(2, 0.12 * bestU);
  const offGridLines = new Set<TextLine>();
  for (const d of deltas) {
    const m = Math.round(d.value / bestU);
    const onGrid = m >= 1 && Math.abs(d.value - m * bestU) <= tol;
    if (!onGrid) {
      offGridLines.add(d.from);
      offGridLines.add(d.to);
    }
  }
  const flagged = offGridLines.size > 0 ? [...offGridLines] : textLines;
  const xs = flagged.map((l) => l.bbox[0]);
  const ys = flagged.map((l) => l.bbox[1]);
  const x2s = flagged.map((l) => l.bbox[0] + l.bbox[2]);
  const y2s = flagged.map((l) => l.bbox[1] + l.bbox[3]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const bbox: [number, number, number, number] = [
    minX,
    minY,
    Math.max(...x2s) - minX,
    Math.max(...y2s) - minY,
  ];

  return measured([
    {
      id: newFindingId(),
      dimension: "rhythm",
      severity: snap < 0.55 ? "major" : "minor",
      bbox,
      measured: { value: Math.round(snap * 100) / 100, expected: [lo, hi], unit: " baseline-grid fit" },
    },
  ]);
}
