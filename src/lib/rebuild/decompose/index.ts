import type { TracedPath } from "../trace";
import { precompute } from "./precompute";
import { runPhotoStage } from "./photo";
import { runTextStage } from "./text";
import { runGradientStage } from "./gradient";
import { runShapeStage } from "./shape";
import { runEffectStage } from "./effect";
import { runConfidenceGate } from "./confidence";
import { runOrderStage } from "./order";
import type { DesignElement, DecomposeContext } from "./types";

export type { DesignElement, ElementKind, GradientDescriptor, GradientStop } from "./types";

let idCounter = 0;
function makeIdFactory(): () => string {
  idCounter = 0;
  return () => `el_${(idCounter++).toString(36)}`;
}

export interface DecomposeResult {
  elements: DesignElement[];
  ctx: DecomposeContext;
}

/**
 * Runs all 8 decompose stages in order over a trace result. Stage order IS
 * the entire conflict-resolution rule: each stage may only claim paths
 * still unowned in `ctx.claimed` (the ownership ledger), and once claimed a
 * path is never reconsidered by a later stage. See each stage file's own
 * doc comment for why it sits where it does in this sequence.
 *
 * Deliberately deviates from the design doc's stage numbering in one place:
 * the confidence GATE (7) runs before hierarchy/z-index (6), not after —
 * a downgraded element's final kind has to be settled before the z-index
 * comparator reads its kindRank, or a gated gradient would still sort as if
 * it were one. Per-kind confidence SCORING still happens inline in each
 * classifying stage (1-5), which is the part that has to run in sequence.
 */
export function decompose(paths: TracedPath[], rgb: Uint8ClampedArray, gray: Uint8ClampedArray, width: number, height: number): DecomposeResult {
  const ctx = precompute(paths, rgb, gray, width, height);
  const nextId = makeIdFactory();

  const photo = runPhotoStage(ctx, nextId);
  if (photo.degenerate) {
    return { elements: photo.elements, ctx };
  }

  const textElements = runTextStage(ctx, nextId);
  const gradientElements = runGradientStage(ctx, nextId);
  const shapeElements = runShapeStage(ctx, nextId);

  const elements: DesignElement[] = [...photo.elements, ...textElements, ...gradientElements, ...shapeElements];

  runEffectStage(ctx, elements);
  runConfidenceGate(elements);
  runOrderStage(ctx, elements);

  return { elements, ctx };
}
