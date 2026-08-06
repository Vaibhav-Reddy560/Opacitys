import { CONFIDENCE_GATE_MIN } from "./constants";
import type { DesignElement } from "./types";

/**
 * Stage 7 (gating half — the scoring half lives inline in each classifying
 * stage, since only that stage's own evidence can produce a defensible
 * per-kind formula; a generic cross-stage scorer would have to reinvent
 * that domain knowledge). Runs BEFORE order.ts, not after as the design doc
 * lists it: a downgraded element's kind has to be final before the z-index
 * comparator reads its kindRank, or a gradient that got gated to a plain
 * shape would still paint as if it were still a gradient.
 *
 * The gate itself is simple and absolute: below CONFIDENCE_GATE_MIN, an
 * element is not asserted as the kind it almost-matched — a classification
 * this pipeline doesn't believe shouldn't be shown as fact. It becomes a
 * generic, unnamed shape instead (never deleted — the geometry is real even
 * when the interpretation isn't), with its parent link cleared so order.ts
 * finds it a normal spatial parent rather than an effect's caster link.
 */
export function runConfidenceGate(elements: DesignElement[]): void {
  for (const el of elements) {
    if (el.kind === "shape" || el.confidence >= CONFIDENCE_GATE_MIN) continue;
    el.kind = "shape";
    el.primitive = undefined;
    el.gradient = undefined;
    el.parentId = null;
    el.name = "Shape";
  }
}
