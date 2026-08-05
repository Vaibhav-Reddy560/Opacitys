import type { TrackAFinding } from "@/lib/critique/types";

/**
 * What every analyzer actually returns. `findings: []` is ambiguous on its
 * own — it could mean "measured this and it was clean" or "couldn't measure
 * this at all" (too few text lines, degenerate image, etc.), and those two
 * cases must score differently: a dimension the design genuinely passed
 * should score 100; a dimension nothing could say anything about should not
 * be scored at all. `evaluated` is what lets `computeScores` (grounding.ts)
 * average only over dimensions something actually measured, instead of
 * silently giving every skipped dimension a free 100.
 */
export interface AnalyzerResult {
  evaluated: boolean;
  findings: TrackAFinding[];
}

/** A precondition wasn't met — too little signal to say anything at all. */
export const SKIPPED: AnalyzerResult = { evaluated: false, findings: [] };

/** The analyzer ran to completion — pass `findings` if something was
 * flagged, or omit it for "measured, and it was clean." */
export function measured(findings: TrackAFinding[] = []): AnalyzerResult {
  return { evaluated: true, findings };
}
