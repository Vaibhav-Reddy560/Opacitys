import * as C from "./constants";
import type { DecomposeContext, DesignElement } from "./types";

function bboxArea(el: DesignElement): number {
  return el.bbox[2] * el.bbox[3];
}

function kindRankBase(kind: string): number {
  return C.KIND_RANK[kind] ?? 2;
}

/**
 * Stage 6. Two responsibilities: parent/containment hierarchy, and the
 * build-order comparator.
 *
 * Parent = the smallest-area element whose bbox contains >=90% of this
 * element's own bbox — bbox containment, not pixel-mask containment: a
 * glyph OCCLUDES the card it sits on, so it's absent from the card's own
 * pixel mask, and a mask test would orphan every piece of type on every
 * card. `effect` elements are skipped — stage 5 already pointed them at
 * their caster, a semantic attachment rather than spatial containment.
 *
 * z-index comparator: [depth, kindRank, -areaFrac, y, x, id]. Depth first
 * guarantees a valid paint order on its own (a child always paints after
 * its parent); kindRank orders gradient (background wash) before image
 * (structural bed) before shape (cards/rules) before text (finished last);
 * -areaFrac paints the biggest sibling first (outside-in, matching how
 * designers actually build); y/x give reading order to equal-area
 * siblings; id is the final deterministic tiebreak. `effect` is pinned to
 * HALF a rank step ahead of its caster's kind, at the CASTER's depth (not
 * its own) — so a shadow always sorts immediately before the thing casting
 * it, never above it.
 */
export function runOrderStage(ctx: DecomposeContext, elements: DesignElement[]): void {
  const byId = new Map(elements.map((el) => [el.id, el] as const));

  for (const el of elements) {
    if (el.kind === "effect") continue;
    const [ex, ey, ew, eh] = el.bbox;
    const eArea = ew * eh;
    if (eArea <= 0) continue;

    let bestParent: DesignElement | null = null;
    let bestArea = Infinity;
    for (const other of elements) {
      if (other.id === el.id || other.kind === "effect") continue;
      const oArea = bboxArea(other);
      if (oArea <= eArea) continue;
      const [ox, oy, ow, oh] = other.bbox;
      const ix0 = Math.max(ox, ex), iy0 = Math.max(oy, ey);
      const ix1 = Math.min(ox + ow, ex + ew), iy1 = Math.min(oy + oh, ey + eh);
      const inter = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
      if (inter / eArea >= C.ORDER_PARENT_MIN_CONTAINMENT && oArea < bestArea) {
        bestArea = oArea;
        bestParent = other;
      }
    }
    el.parentId = bestParent ? bestParent.id : null;
  }

  const depthOf = (el: DesignElement): number => {
    let d = 0;
    let cur = el;
    const seen = new Set<string>([el.id]);
    while (cur.parentId) {
      const p = byId.get(cur.parentId);
      if (!p || seen.has(p.id)) break; // guard a mis-set/cyclic parent rather than looping forever
      seen.add(p.id);
      d++;
      cur = p;
    }
    return d;
  };

  const keyed = elements.map((el) => {
    const caster = el.kind === "effect" && el.parentId ? byId.get(el.parentId) : null;
    const depth = caster ? depthOf(caster) : depthOf(el);
    const kindRank = caster ? kindRankBase(caster.kind) - 0.5 : kindRankBase(el.kind);
    return { el, depth, kindRank, negAreaFrac: -(bboxArea(el) / ctx.canvasArea), y: el.bbox[1], x: el.bbox[0] };
  });

  keyed.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.kindRank !== b.kindRank) return a.kindRank - b.kindRank;
    if (a.negAreaFrac !== b.negAreaFrac) return a.negAreaFrac - b.negAreaFrac;
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.el.id < b.el.id ? -1 : 1;
  });

  keyed.forEach((k, i) => {
    k.el.zIndex = i;
  });
}
