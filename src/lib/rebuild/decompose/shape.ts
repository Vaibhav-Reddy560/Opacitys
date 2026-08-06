import * as C from "./constants";
import type { DecomposeContext, DesignElement } from "./types";

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

class UnionFind {
  parent: Map<number, number> = new Map();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== cur) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface Primitive {
  name: string;
  fPrimitive: number;
  fResidual: number;
}

/** First-match-wins primitive fit for a SINGLE candidate path, using stage 0's precomputed features and corner spectrum. Naming beats numbering — "Rectangle" is a checkable claim, "Path 7" is not. */
function fitPrimitive(ctx: DecomposeContext, pi: number): Primitive {
  const feat = ctx.features.get(pi)!;
  const path = ctx.paths[pi];
  const [, , w, h] = path.bbox;
  const corners = ctx.corners.get(pi) ?? [];
  const area = feat.netArea;

  // Ring / donut: exactly one hole, roughly concentric and roughly round.
  // Holes aren't in `candidates` (no precomputed features), so this uses
  // bbox-only evidence — a coarser but sufficient concentricity/roundness
  // check rather than the hole's own corner spectrum.
  if (path.holeChildren.length === 1) {
    const hole = ctx.paths[path.holeChildren[0]];
    const [hx, hy, hw, hh] = hole.bbox;
    const outerCx = path.bbox[0] + w / 2, outerCy = path.bbox[1] + h / 2;
    const innerCx = hx + hw / 2, innerCy = hy + hh / 2;
    const outerR = (w + h) / 4;
    const dist = Math.hypot(outerCx - innerCx, outerCy - innerCy);
    const outerRound = Math.abs(w / h - 1) <= 0.15 && feat.compactness >= 0.85;
    const innerRound = Math.abs(hw / hh - 1) <= 0.15;
    if (outerRound && innerRound && dist <= C.SHAPE_RING_CONCENTRIC_TOLERANCE * outerR) {
      const outerArea = Math.PI * (w / 2) * (h / 2);
      const innerArea = Math.PI * (hw / 2) * (hh / 2);
      const modelArea = Math.max(1, outerArea - innerArea);
      return { name: "Ring", fPrimitive: 0.9, fResidual: residualScore(area, modelArea) };
    }
  }

  // Rectangle / Square — exact to a half-pixel on an axis-aligned contour.
  if (
    feat.extent >= C.SHAPE_RECT_MIN_EXTENT &&
    feat.qFrac <= C.SHAPE_RECT_MAX_QFRAC &&
    corners.length === 4 &&
    corners.every((c) => c.angle >= C.SHAPE_RECT_CORNER_MIN_TURN)
  ) {
    const square = Math.abs(w / h - 1) <= C.SHAPE_RECT_SQUARE_TOLERANCE;
    return { name: square ? "Square" : "Rectangle", fPrimitive: 0.95, fResidual: residualScore(area, w * h) };
  }

  // Rounded rectangle / Pill — radius solved EXACTLY from the area equation, not fitted.
  if (feat.extent >= C.SHAPE_ROUNDED_MIN_EXTENT && feat.extent < C.SHAPE_RECT_MIN_EXTENT) {
    const deficit = w * h - area;
    if (deficit > 0) {
      const r = Math.sqrt(deficit / (4 - Math.PI));
      const minSide = Math.min(w, h);
      if (r >= 2 && r <= 0.5 * minSide) {
        const isPill = r >= C.SHAPE_PILL_MIN_RADIUS_RATIO * minSide && Math.abs(w - h) > 1;
        const modelArea = w * h - (4 - Math.PI) * r * r;
        return {
          name: isPill ? "Pill" : "Rounded rectangle",
          fPrimitive: 0.9,
          fResidual: residualScore(area, modelArea),
        };
      }
    }
  }

  // Circle / Ellipse — qFrac is load-bearing: a regular octagon measures
  // compactness 0.948, so compactness alone would call it a circle.
  if (feat.compactness >= C.SHAPE_CIRCLE_MIN_COMPACTNESS && feat.qFrac >= C.SHAPE_CIRCLE_MIN_QFRAC) {
    const aspect = h > 0 ? w / h : 1;
    if (Math.abs(aspect - 1) <= C.SHAPE_CIRCLE_ASPECT_TOLERANCE) {
      const modelArea = Math.PI * (w / 2) * (h / 2);
      return { name: "Circle", fPrimitive: 0.95, fResidual: residualScore(area, modelArea) };
    }
  }
  if (feat.compactness >= C.SHAPE_ELLIPSE_MIN_COMPACTNESS) {
    const modelArea = Math.PI * (w / 2) * (h / 2);
    if (Math.abs(area - modelArea) / modelArea <= C.SHAPE_ELLIPSE_AREA_TOLERANCE) {
      return { name: "Ellipse", fPrimitive: 0.9, fResidual: residualScore(area, modelArea) };
    }
  }

  // Triangle — the 0.52 upper bound is a theorem (max inscribed-triangle
  // area in its own bbox is 1/2 of the bbox), not a tuned number.
  if (
    corners.length === 3 &&
    corners.every((c) => c.angle >= C.SHAPE_TRIANGLE_MIN_TURN) &&
    feat.qFrac <= C.SHAPE_TRIANGLE_MAX_QFRAC &&
    feat.extent >= C.SHAPE_TRIANGLE_EXTENT_LO &&
    feat.extent <= C.SHAPE_TRIANGLE_EXTENT_HI
  ) {
    return { name: "Triangle", fPrimitive: 0.85, fResidual: 1 };
  }

  // Regular polygon (5-8 sides) — corner COUNT and ANGLE evidence only; edge-
  // length equality is skipped (would need corner coordinates the spectrum
  // doesn't retain), a documented simplification vs. the full spec.
  if (corners.length >= 5 && corners.length <= 8 && feat.qFrac <= 0.1) {
    const n = corners.length;
    const turnExpected = 360 / n; // exterior turn angle of a regular n-gon
    if (corners.every((c) => Math.abs(c.angle - turnExpected) <= C.SHAPE_POLY_ANGLE_TOLERANCE)) {
      return { name: `Regular polygon (${n})`, fPrimitive: 0.8, fResidual: 1 };
    }
  }

  // Divider / rule.
  if (Math.min(w, h) <= C.SHAPE_DIVIDER_MAX_THICKNESS || (feat.aspect >= C.SHAPE_DIVIDER_MIN_ASPECT && feat.extent >= C.SHAPE_DIVIDER_MIN_EXTENT)) {
    return { name: "Divider", fPrimitive: 0.8, fResidual: residualScore(area, w * h) };
  }

  if (feat.compactness >= C.SHAPE_BLOB_MIN_COMPACTNESS) {
    return { name: "Blob", fPrimitive: 0.6, fResidual: 1 };
  }
  return { name: "Complex path", fPrimitive: 0.4, fResidual: 1 };
}

function residualScore(actual: number, model: number): number {
  if (model <= 0) return 1;
  const rel = Math.abs(actual - model) / model;
  return 1 - 0.15 * Math.max(0, Math.min(1, rel / 0.2));
}

/**
 * Stage 4. Whatever survives text and gradient claiming. Three passes
 * before primitive fitting, via a union-find over unclaimed candidates:
 * (a) speck absorption — a tiny path adjacent to exactly one larger,
 * similar-color path is quantization crumb, not its own element;
 * (b) same-layer adjacency merge — pathscan sometimes splits one fill at a
 * thin waist or a hole, never merges disjoint same-layer paths (two blue
 * circles stay two shapes); (c) icon grouping — many small same-mark paths
 * (a multi-path logo) become one "Icon / mark" element instead of a dozen.
 * Single-member groups get the full primitive fit; multi-member groups are
 * named by what grouped them, not fitted to a primitive (a merged outline
 * has no single clean boundary to test) — a documented simplification of
 * the full spec.
 */
export function runShapeStage(ctx: DecomposeContext, nextId: () => string): DesignElement[] {
  const unclaimed = ctx.candidates.filter((pi) => !ctx.claimed[pi]);
  if (unclaimed.length === 0) return [];

  const uf = new UnionFind();
  for (const pi of unclaimed) uf.find(pi);

  const absorbedSpecks = new Set<number>();
  // (a) Speck absorption.
  for (const pi of unclaimed) {
    const feat = ctx.features.get(pi)!;
    if (feat.netArea >= C.SHAPE_SPECK_MAX_AREA_FRAC * ctx.canvasArea) continue;
    const neighbors = ctx.adjacency.get(pi);
    if (!neighbors) continue;
    const qualifying: number[] = [];
    for (const nb of neighbors.keys()) {
      if (!unclaimed.includes(nb)) continue;
      const nf = ctx.features.get(nb)!;
      if (nf.netArea <= feat.netArea) continue;
      if (rgbDistance(ctx.paths[pi].color, ctx.paths[nb].color) <= C.SHAPE_SPECK_MAX_COLOR_DIST) qualifying.push(nb);
    }
    if (qualifying.length === 1) {
      uf.union(pi, qualifying[0]);
      absorbedSpecks.add(pi);
    }
  }

  // (b) Same-layer adjacency merge.
  for (const pi of unclaimed) {
    const neighbors = ctx.adjacency.get(pi);
    if (!neighbors) continue;
    for (const nb of neighbors.keys()) {
      if (!unclaimed.includes(nb)) continue;
      if (ctx.paths[pi].layerIndex === ctx.paths[nb].layerIndex) uf.union(pi, nb);
    }
  }

  // (c) Icon grouping among small, still-singleton-ish groups. Simplified
  // constrained single-linkage: pairwise within a shared distance
  // threshold, skipping a merge that would blow past the layer-diversity
  // or aspect constraints.
  const groupOf = (pi: number) => uf.find(pi);
  const smallReps = new Map<number, { centroid: { x: number; y: number }; diag: number }>();
  for (const pi of unclaimed) {
    const feat = ctx.features.get(pi)!;
    if (feat.areaFrac > C.SHAPE_ICON_MAX_AREA_FRAC) continue;
    const root = groupOf(pi);
    const [x, y, w, h] = ctx.paths[pi].bbox;
    const centroid = { x: x + w / 2, y: y + h / 2 };
    const diag = Math.hypot(w, h);
    const existing = smallReps.get(root);
    if (!existing || diag > existing.diag) smallReps.set(root, { centroid, diag });
  }
  const smallRoots = [...smallReps.keys()];
  if (smallRoots.length >= 2) {
    const medianDiag = median(smallRoots.map((r) => smallReps.get(r)!.diag));
    const linkageDist = C.SHAPE_ICON_LINKAGE_DIAGONAL_MULT * medianDiag;
    for (let i = 0; i < smallRoots.length; i++) {
      for (let j = i + 1; j < smallRoots.length; j++) {
        const a = smallReps.get(smallRoots[i])!;
        const b = smallReps.get(smallRoots[j])!;
        if (Math.hypot(a.centroid.x - b.centroid.x, a.centroid.y - b.centroid.y) <= linkageDist) {
          uf.union(smallRoots[i], smallRoots[j]);
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (const pi of unclaimed) {
    const root = uf.find(pi);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(pi);
  }

  const elements: DesignElement[] = [];
  for (const members of groups.values()) {
    for (const pi of members) ctx.claimed[pi] = 1;

    if (members.length === 1) {
      // A singleton group means no speck was absorbed into it (absorption
      // always produces a multi-member group), so fClean is always 1 here.
      const pi = members[0];
      const prim = fitPrimitive(ctx, pi);
      const confidence = Math.max(0, Math.min(1, prim.fPrimitive * prim.fResidual));
      elements.push({
        id: nextId(),
        kind: "shape",
        bbox: ctx.paths[pi].bbox,
        pathIndices: [pi],
        fill: rgbToHex(...ctx.paths[pi].color),
        primitive: prim.name,
        parentId: null,
        zIndex: 0,
        confidence,
        confidenceParts: { fPrimitive: prim.fPrimitive, fResidual: prim.fResidual, fClean: 1 },
        name: prim.name,
      });
      continue;
    }

    // Multi-member group.
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    let totalArea = 0, sr = 0, sg = 0, sb = 0;
    const layers = new Set<number>();
    let absorbedArea = 0;
    for (const pi of members) {
      const [px, py, pw, ph] = ctx.paths[pi].bbox;
      bx0 = Math.min(bx0, px); by0 = Math.min(by0, py);
      bx1 = Math.max(bx1, px + pw); by1 = Math.max(by1, py + ph);
      const f = ctx.features.get(pi)!;
      totalArea += f.netArea;
      sr += ctx.paths[pi].color[0] * f.netArea;
      sg += ctx.paths[pi].color[1] * f.netArea;
      sb += ctx.paths[pi].color[2] * f.netArea;
      layers.add(ctx.paths[pi].layerIndex);
      if (absorbedSpecks.has(pi)) absorbedArea += f.netArea;
    }
    const bw = bx1 - bx0, bh = by1 - by0;
    const aspect = bh > 0 ? bw / bh : 1;
    const isIcon =
      totalArea <= C.SHAPE_ICON_MAX_AREA_FRAC * ctx.canvasArea * members.length &&
      layers.size <= C.SHAPE_ICON_MAX_LAYERS &&
      aspect >= C.SHAPE_ICON_ASPECT_LO &&
      aspect <= C.SHAPE_ICON_ASPECT_HI;

    const fClean = 1 - 0.2 * (totalArea > 0 ? absorbedArea / totalArea : 0);
    const primName = isIcon ? "Icon / mark" : "Compound shape";
    const fPrimitive = isIcon ? 0.5 : 0.45;
    const confidence = Math.max(0, Math.min(1, fPrimitive * fClean));

    elements.push({
      id: nextId(),
      kind: "shape",
      bbox: [bx0, by0, bw, bh],
      pathIndices: members,
      fill: totalArea > 0 ? rgbToHex(sr / totalArea, sg / totalArea, sb / totalArea) : "#808080",
      primitive: primName,
      parentId: null,
      zIndex: 0,
      confidence,
      confidenceParts: { fPrimitive, fClean },
      name: primName,
    });
  }

  return elements;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
