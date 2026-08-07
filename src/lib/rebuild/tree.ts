/**
 * Turns a flat list of detected elements into the nested tree the layer
 * panel shows — "navigation bar" owning "logo", "text", "button".
 *
 * Salvaged from the deleted vector pipeline's `decompose/order.ts`, which
 * solved exactly this problem from exactly this input (a set of boxes) and
 * had already been reasoned through; only the coupling to that pipeline's
 * types and constants file is gone.
 */

export interface Boxed {
  id: string;
  /** x, y, w, h in the version image's pixel space. */
  bbox: [number, number, number, number];
  kind: string;
  parentId: string | null;
  zIndex: number;
}

/**
 * A box must sit this far inside another to be considered its child.
 * Deliberately not 1.0: a detector's box for a headline routinely spills a
 * pixel or two past the section box drawn around it, and a strict test
 * would orphan it to the root.
 */
const MIN_CONTAINMENT = 0.9;

/**
 * Paint order by kind. Backgrounds and sections first, type last — the
 * order a designer actually builds in, and also a safe paint order since a
 * later element may overlap an earlier one but not vice versa.
 */
const KIND_RANK: Record<string, number> = {
  section: 0,
  group: 0,
  image: 1,
  shape: 2,
  icon: 3,
  logo: 3,
  button: 3,
  text: 4,
};

function area(el: Boxed): number {
  return el.bbox[2] * el.bbox[3];
}

/** Fraction of `inner`'s box that lies inside `outer`'s box. */
function containment(inner: Boxed, outer: Boxed): number {
  const a = area(inner);
  if (a <= 0) return 0;
  const [ix, iy, iw, ih] = inner.bbox;
  const [ox, oy, ow, oh] = outer.bbox;
  const x0 = Math.max(ix, ox);
  const y0 = Math.max(iy, oy);
  const x1 = Math.min(ix + iw, ox + ow);
  const y1 = Math.min(iy + ih, oy + oh);
  return (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / a;
}

/**
 * Assigns `parentId` (smallest strictly-larger box that contains this one)
 * and `zIndex` (depth, then kind, then largest-first, then reading order).
 * Mutates in place and returns the same array, sorted by zIndex.
 *
 * Bbox containment, not pixel containment: a button's label sits ON the
 * button and is absent from its filled area, so a pixel test would orphan
 * every piece of type in the design.
 */
export function buildTree<T extends Boxed>(elements: T[]): T[] {
  const byId = new Map(elements.map((el) => [el.id, el] as const));

  for (const el of elements) {
    const elArea = area(el);
    if (elArea <= 0) {
      el.parentId = null;
      continue;
    }
    let bestParent: T | null = null;
    let bestArea = Infinity;
    for (const other of elements) {
      if (other.id === el.id) continue;
      const oArea = area(other);
      // Strictly larger, so two identical boxes can never adopt each other.
      if (oArea <= elArea) continue;
      if (containment(el, other) >= MIN_CONTAINMENT && oArea < bestArea) {
        bestArea = oArea;
        bestParent = other;
      }
    }
    el.parentId = bestParent ? bestParent.id : null;
  }

  const depthOf = (el: T): number => {
    let d = 0;
    let cur: T = el;
    const seen = new Set<string>([el.id]);
    while (cur.parentId) {
      const p = byId.get(cur.parentId);
      // Guards a cyclic/mis-set parent rather than looping forever.
      if (!p || seen.has(p.id)) break;
      seen.add(p.id);
      d++;
      cur = p;
    }
    return d;
  };

  const keyed = elements.map((el) => ({
    el,
    depth: depthOf(el),
    kindRank: KIND_RANK[el.kind] ?? 3,
    negArea: -area(el),
    y: el.bbox[1],
    x: el.bbox[0],
  }));

  keyed.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.kindRank !== b.kindRank) return a.kindRank - b.kindRank;
    if (a.negArea !== b.negArea) return a.negArea - b.negArea;
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.el.id < b.el.id ? -1 : 1; // deterministic final tiebreak
  });

  keyed.forEach((k, i) => {
    k.el.zIndex = i;
  });

  return keyed.map((k) => k.el);
}

/**
 * Reve-style display names: one bare label per type, then numbered —
 * `text`, `text 2`, `text 3`. Assigned in the order given, so callers
 * should pass elements already sorted the way the panel lists them or the
 * numbering will look arbitrary.
 */
export function autoNumberNames<T extends { kind: string; name?: string | null }>(elements: T[]): string[] {
  const seen = new Map<string, number>();
  return elements.map((el) => {
    const base = (el.name?.trim() || el.kind || "layer").toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  });
}
