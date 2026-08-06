import * as C from "./constants";
import type { DecomposeContext, DesignElement, GradientStop } from "./types";

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Area-weighted 3D PCA over a small set of colors — power iteration + deflation, no library, deterministic. Returns the top axis, its eigenvalue ratio (collinearity strength), and the max perpendicular residual (guards against a tiny-variance cloud trivially passing the ratio test). */
function colorCollinearity(colors: [number, number, number][], weights: number[]) {
  const n = colors.length;
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const mean: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) mean[d] += (colors[i][d] * weights[i]) / totalW;

  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const d = [colors[i][0] - mean[0], colors[i][1] - mean[1], colors[i][2] - mean[2]];
    const w = weights[i] / totalW;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += w * d[a] * d[b];
  }

  const powerIter = (M: number[][]): { vec: number[]; val: number } => {
    let v = [1, 1, 1];
    for (let it = 0; it < 20; it++) {
      const nv = [0, 0, 0];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) nv[a] += M[a][b] * v[b];
      const norm = Math.hypot(nv[0], nv[1], nv[2]) || 1;
      v = nv.map((x) => x / norm);
    }
    const Mv = [0, 0, 0];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Mv[a] += M[a][b] * v[b];
    return { vec: v, val: v[0] * Mv[0] + v[1] * Mv[1] + v[2] * Mv[2] };
  };

  const { vec: v1, val: l1raw } = powerIter(cov);
  const l1 = Math.max(0, l1raw);
  const deflated = cov.map((row, a) => row.map((val, b) => val - l1 * v1[a] * v1[b]));
  const { val: l2raw } = powerIter(deflated);
  const l2 = Math.max(0, l2raw);
  const deflated2 = deflated.map((row, a) => row.map((val, b) => val - l2 * v1[a] * v1[b]));
  const { val: l3raw } = powerIter(deflated2);
  const l3 = Math.max(0, l3raw);

  let maxResidual = 0;
  for (const c of colors) {
    const d = [c[0] - mean[0], c[1] - mean[1], c[2] - mean[2]];
    const t = d[0] * v1[0] + d[1] * v1[1] + d[2] * v1[2];
    const distSq = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - t * t;
    maxResidual = Math.max(maxResidual, Math.sqrt(Math.max(0, distSq)));
  }

  return { mean, axis: v1 as [number, number, number], ratio: l1 / (l1 + l2 + l3 || 1), maxResidual };
}

function pca2D(points: Array<{ x: number; y: number }>, weights: number[]) {
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  let mx = 0, my = 0;
  for (let i = 0; i < points.length; i++) {
    mx += (points[i].x * weights[i]) / totalW;
    my += (points[i].y * weights[i]) / totalW;
  }
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - mx, dy = points[i].y - my, w = weights[i] / totalW;
    sxx += w * dx * dx;
    sxy += w * dx * dy;
    syy += w * dy * dy;
  }
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 + disc;
  let vx = sxy, vy = lambda1 - sxx;
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) { vx = 1; vy = 0; }
  const norm = Math.hypot(vx, vy) || 1;
  return { dir: { x: vx / norm, y: vy / norm }, mean: { x: mx, y: my } };
}

function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const rankOf = (arr: number[]) => {
    const order = arr.map((_, i) => i).sort((i, j) => arr[i] - arr[j]);
    const r = new Array(n);
    order.forEach((originalIdx, rankPos) => { r[originalIdx] = rankPos; });
    return r;
  };
  const ra = rankOf(a), rb = rankOf(b);
  const meanR = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - meanR) * (rb[i] - meanR);
    da += (ra[i] - meanR) ** 2;
    db += (rb[i] - meanR) ** 2;
  }
  const denom = Math.sqrt(da * db) || 1;
  return num / denom;
}

interface LayerAgg {
  layerIndex: number;
  color: [number, number, number];
  totalArea: number;
  centroid: { x: number; y: number };
  bbox: [number, number, number, number];
  largestPathArea: number;
  paths: number[];
}

/**
 * Geometry (bbox, centroid) comes from ONLY the layer's single dominant
 * (largest-area) path, not the union of every member path. A smooth
 * gradient quantized to a small palette can put a handful of stray pixels
 * from a distant, barely-different shade into the SAME k-means bin as a
 * band's main region (bin overlap, not a real second region) — the union
 * bbox then stretches across most of the canvas and corrupts every
 * downstream geometry test. `totalArea`/`color` still reflect every member
 * path (so the collinearity weighting stays honest), and `paths` still
 * lists all of them (so they all get claimed once the chain is accepted) —
 * only the SHAPE evidence narrows to the path that's actually the band.
 */
function aggregateLayer(ctx: DecomposeContext, layerIndex: number, memberPaths: number[]): LayerAgg {
  let totalArea = 0;
  let dominant = memberPaths[0];
  let dominantArea = -1;
  for (const pi of memberPaths) {
    const f = ctx.features.get(pi)!;
    totalArea += f.netArea;
    if (f.netArea > dominantArea) {
      dominantArea = f.netArea;
      dominant = pi;
    }
  }
  const [dx, dy, dw, dh] = ctx.paths[dominant].bbox;
  return {
    layerIndex,
    color: ctx.paths[memberPaths[0]].color,
    totalArea,
    centroid: { x: dx + dw / 2, y: dy + dh / 2 },
    bbox: [dx, dy, dw, dh],
    largestPathArea: dominantArea,
    paths: memberPaths,
  };
}

/**
 * Stage 3. Runs on layers still mostly unclaimed after text (>=70% of
 * area) — dark type on a card would otherwise read as an extra band.
 * Chains grow on the LAYER ADJACENCY GRAPH, not palette index: kmeans2
 * orders centers by descending membership, so index carries no color or
 * spatial meaning.
 *
 * Growth is greedy and GATED BY COLLINEARITY AT EVERY STEP, not a plain
 * connected-components pass over "strong border" edges. An earlier version
 * did exactly that and failed on the first real fixture it ran against: a
 * solid-color button sitting adjacent to a real 3-band gradient shares a
 * perfectly "strong" border by area, so a naive connected-components pass
 * pulls it into the chain, corrupts the color axis, and fails collinearity
 * for the WHOLE chain — losing a clean gradient over one unrelated
 * neighbor. Growing step-by-step and testing collinearity after each
 * tentative addition avoids ever taking that step in the first place.
 */
export function runGradientStage(ctx: DecomposeContext, nextId: () => string): DesignElement[] {
  const layerToPaths = new Map<number, number[]>();
  const layerTotalAllPaths = new Map<number, number>();
  for (const pi of ctx.candidates) {
    const layer = ctx.paths[pi].layerIndex;
    const f = ctx.features.get(pi)!;
    layerTotalAllPaths.set(layer, (layerTotalAllPaths.get(layer) ?? 0) + f.netArea);
    if (ctx.claimed[pi]) continue;
    if (!layerToPaths.has(layer)) layerToPaths.set(layer, []);
    layerToPaths.get(layer)!.push(pi);
  }

  // Both tests run BEFORE the adjacency graph is built, not after components
  // form — a layer that fails the dominant-path-share test (fragmented text,
  // a shattered photo region) must never act as a bridge connecting two
  // otherwise-unrelated regions into one bogus "gradient". A single element
  // (a solid-color button, a paragraph of text) touching the background is
  // exactly this failure mode if the filter runs late.
  const eligible = new Set<number>();
  for (const [layer, paths] of layerToPaths) {
    const unclaimedArea = paths.reduce((s, pi) => s + ctx.features.get(pi)!.netArea, 0);
    const allArea = layerTotalAllPaths.get(layer) ?? unclaimedArea;
    if (allArea <= 0 || unclaimedArea / allArea < C.GRADIENT_LAYER_UNCLAIMED_FRAC) continue;
    const largestPathArea = Math.max(...paths.map((pi) => ctx.features.get(pi)!.netArea));
    if (largestPathArea / unclaimedArea < C.GRADIENT_MIN_DOMINANT_PATH_SHARE) continue;
    eligible.add(layer);
  }

  // Layer-level adjacency: aggregate path-level shared boundary by layer pair.
  const layerAdj = new Map<number, Map<number, number>>();
  const layerPerimeter = new Map<number, number>();
  for (const [layer, paths] of layerToPaths) {
    let perim = 0;
    for (const pi of paths) perim += ctx.features.get(pi)!.perimeter;
    layerPerimeter.set(layer, perim);
  }
  for (const [layer, paths] of layerToPaths) {
    if (!eligible.has(layer)) continue;
    for (const pi of paths) {
      const neighbors = ctx.adjacency.get(pi);
      if (!neighbors) continue;
      for (const [nb, shared] of neighbors) {
        const nbLayer = ctx.paths[nb].layerIndex;
        if (nbLayer === layer || !eligible.has(nbLayer)) continue;
        let m = layerAdj.get(layer);
        if (!m) { m = new Map(); layerAdj.set(layer, m); }
        m.set(nbLayer, (m.get(nbLayer) ?? 0) + shared);
      }
    }
  }

  // Greedy chain growth, gated by collinearity at EVERY step — not a plain
  // connected-components pass. That distinction matters: a single unrelated
  // element (a solid-color button, a paragraph of text) can sit adjacent to
  // a real gradient with a perfectly "strong" shared border by area, and a
  // naive connected-components pass would pull it into the chain, corrupt
  // the color axis, and fail the whole chain's collinearity test at the
  // end — exactly the failure this greedy version avoids by never taking a
  // step that would fail the test.
  const layerAgg = new Map<number, LayerAgg>();
  for (const layer of eligible) layerAgg.set(layer, aggregateLayer(ctx, layer, layerToPaths.get(layer)!));

  const used = new Set<number>();
  const components: number[][] = [];
  const seeds = [...eligible].sort((a, b) => (layerAgg.get(b)?.totalArea ?? 0) - (layerAgg.get(a)?.totalArea ?? 0));

  for (const seed of seeds) {
    if (used.has(seed)) continue;
    const chain = [seed];
    const inChain = new Set(chain);

    for (;;) {
      const smallerPerim0 = layerPerimeter.get(chain[0]) ?? Infinity;
      const candidates = new Set<number>();
      for (const l of chain) {
        for (const [nb, shared] of layerAdj.get(l) ?? []) {
          if (used.has(nb) || inChain.has(nb)) continue;
          const smallerPerim = Math.min(smallerPerim0, layerPerimeter.get(nb) ?? Infinity, layerPerimeter.get(l) ?? Infinity);
          if (shared >= C.GRADIENT_SEED_MIN_SHARED_BOUNDARY_FRAC * smallerPerim) candidates.add(nb);
        }
      }
      if (candidates.size === 0) break;

      // Try every candidate, keep whichever yields the best resulting
      // collinearity ratio, and only commit if that's still an improvement
      // (or the chain is still size 1, where collinearity is undefined).
      let bestCandidate = -1;
      let bestRatio = -Infinity;
      for (const cand of candidates) {
        const trial = [...chain, cand].map((l) => layerAgg.get(l)!);
        const { ratio } = colorCollinearity(trial.map((a) => a.color), trial.map((a) => a.totalArea));
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestCandidate = cand;
        }
      }
      if (chain.length >= 2 && bestRatio < C.GRADIENT_COLLINEARITY_RATIO) break;
      chain.push(bestCandidate);
      inChain.add(bestCandidate);
    }

    if (chain.length >= 2) {
      for (const l of chain) used.add(l);
      components.push(chain);
    }
  }

  const elements: DesignElement[] = [];

  for (const comp of components) {
    const aggs = comp
      .map((layer) => layerAgg.get(layer)!)
      .filter((a) => a.totalArea >= C.GRADIENT_MIN_BAND_AREA_FRAC * ctx.canvasArea);
    if (aggs.length < 2) continue;

    const colors = aggs.map((a) => a.color);
    const weights = aggs.map((a) => a.totalArea);
    const { mean: colorMean, axis: colorAxis, ratio, maxResidual } = colorCollinearity(colors, weights);
    if (ratio < C.GRADIENT_COLLINEARITY_RATIO || maxResidual > C.GRADIENT_COLLINEARITY_MAX_RESIDUAL) {
      // Flat-fill de-banding: collinear-but-tiny extent means this is
      // quantization banding on a FLAT fill, not a gradient — merge to one
      // shape at the area-weighted mean color instead of releasing entirely.
      const extent = maxResidual; // reuse: near-zero variance already implies near-zero extent
      if (extent < C.GRADIENT_FLAT_BAND_MAX_EXTENT && ratio >= C.GRADIENT_COLLINEARITY_RATIO * 0.5) {
        emitFlatMerge(ctx, aggs, nextId, elements);
      }
      continue;
    }

    // Total color extent along the axis — the flat-fill de-banding test.
    const projections = colors.map((c) => (c[0] - colorMean[0]) * colorAxis[0] + (c[1] - colorMean[1]) * colorAxis[1] + (c[2] - colorMean[2]) * colorAxis[2]);
    const colorExtent = Math.max(...projections) - Math.min(...projections);
    if (colorExtent < C.GRADIENT_FLAT_BAND_MAX_EXTENT) {
      emitFlatMerge(ctx, aggs, nextId, elements);
      continue;
    }

    const { dir: geomDir, mean: geomMean } = pca2D(aggs.map((a) => a.centroid), weights);
    const tVals = aggs.map((a) => (a.centroid.x - geomMean.x) * geomDir.x + (a.centroid.y - geomMean.y) * geomDir.y);
    const K = aggs.length;
    const rho = spearman(tVals, projections);
    const monotoneOk = K <= C.GRADIENT_MONOTONE_EXACT_MAX_K ? Math.abs(rho) >= 0.999 : Math.abs(rho) >= C.GRADIENT_MONOTONE_MIN_RHO_LARGE_K;
    if (!monotoneOk) continue;

    // Order bands along the axis (by t), sign-normalize direction so offset increases with t.
    const order = aggs.map((_, i) => i).sort((i, j) => tVals[i] - tVals[j]);
    if (rho < 0) { geomDir.x *= -1; geomDir.y *= -1; }
    const orderedT = order.map((i) => (aggs[i].centroid.x - geomMean.x) * geomDir.x + (aggs[i].centroid.y - geomMean.y) * geomDir.y);

    // Banding via bbox-corner projection (efficient stand-in for a full pixel scan).
    const perpDir = { x: -geomDir.y, y: geomDir.x };
    const bandIntervals: Array<[number, number]> = [];
    const bandPerpExtents: number[] = [];
    let globalPerpMin = Infinity, globalPerpMax = -Infinity;
    for (const idx of order) {
      const [bx, by, bw, bh] = aggs[idx].bbox;
      const corners = [{ x: bx, y: by }, { x: bx + bw, y: by }, { x: bx, y: by + bh }, { x: bx + bw, y: by + bh }];
      let tMin = Infinity, tMax = -Infinity, pMin = Infinity, pMax = -Infinity;
      for (const c of corners) {
        const t = (c.x - geomMean.x) * geomDir.x + (c.y - geomMean.y) * geomDir.y;
        const p = (c.x - geomMean.x) * perpDir.x + (c.y - geomMean.y) * perpDir.y;
        tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
        pMin = Math.min(pMin, p); pMax = Math.max(pMax, p);
      }
      bandIntervals.push([tMin, tMax]);
      bandPerpExtents.push(pMax - pMin);
      globalPerpMin = Math.min(globalPerpMin, pMin);
      globalPerpMax = Math.max(globalPerpMax, pMax);
    }
    const totalPerpExtent = globalPerpMax - globalPerpMin;
    // Every band has to cross the region, not just clip a corner of it.
    const perpOk = totalPerpExtent > 0 && bandPerpExtents.every((e) => e >= C.GRADIENT_MIN_PERP_EXTENT_RATIO * totalPerpExtent);
    if (!perpOk) continue;

    const sumSpans = bandIntervals.reduce((s, [a, b]) => s + (b - a), 0);
    const sorted = [...bandIntervals].sort((a, b) => a[0] - b[0]);
    let unionSpan = 0;
    let curStart = sorted[0][0], curEnd = sorted[0][1];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][0] <= curEnd) curEnd = Math.max(curEnd, sorted[i][1]);
      else { unionSpan += curEnd - curStart; curStart = sorted[i][0]; curEnd = sorted[i][1]; }
    }
    unionSpan += curEnd - curStart;
    const overlapRatio = sumSpans > 0 ? 1 - unionSpan / sumSpans : 1;
    if (overlapRatio > C.GRADIENT_MAX_OVERLAP_RATIO) continue;
    if (totalPerpExtent <= 0) continue;

    // Linear vs radial: strided pixel sample over the chain's combined bbox.
    let cbx0 = Infinity, cby0 = Infinity, cbx1 = -Infinity, cby1 = -Infinity;
    for (const a of aggs) {
      cbx0 = Math.min(cbx0, a.bbox[0]); cby0 = Math.min(cby0, a.bbox[1]);
      cbx1 = Math.max(cbx1, a.bbox[0] + a.bbox[2]); cby1 = Math.max(cby1, a.bbox[1] + a.bbox[3]);
    }
    const layerRank = new Map<number, number>();
    order.forEach((idx, rank) => layerRank.set(aggs[idx].layerIndex, rank));
    const memberLayerSet = new Set(aggs.map((a) => a.layerIndex));
    const memberPathToLayer = new Map<number, number>();
    for (const a of aggs) for (const pi of a.paths) memberPathToLayer.set(pi, a.layerIndex);

    const tExtent = orderedT[orderedT.length - 1] - orderedT[0] || 1;
    const centroidExtreme = aggs[order[0]].centroid;
    let rMax = 0;
    for (const a of aggs) rMax = Math.max(rMax, Math.hypot(a.centroid.x - centroidExtreme.x, a.centroid.y - centroidExtreme.y));
    rMax = rMax || 1;

    let nLin = 0, sumLin = 0, nRad = 0, sumRad = 0;
    const stride = 4;
    for (let y = Math.max(0, Math.floor(cby0)); y < Math.min(ctx.height, Math.ceil(cby0 + (cby1 - cby0))); y += stride) {
      for (let x = Math.max(0, Math.floor(cbx0)); x < Math.min(ctx.width, Math.ceil(cbx0 + (cbx1 - cbx0))); x += stride) {
        const owner = ctx.pixelOwner[y * ctx.width + x];
        if (owner < 0) continue;
        const layer = memberPathToLayer.get(owner);
        if (layer === undefined || !memberLayerSet.has(layer)) continue;
        const cHat = (layerRank.get(layer) ?? 0) / Math.max(1, K - 1);

        const tHat = ((x - geomMean.x) * geomDir.x + (y - geomMean.y) * geomDir.y - orderedT[0]) / tExtent;
        sumLin += Math.abs(tHat - cHat);
        nLin++;

        const rHat = Math.hypot(x - centroidExtreme.x, y - centroidExtreme.y) / rMax;
        sumRad += Math.abs(rHat - cHat);
        nRad++;
      }
    }
    if (nLin === 0) continue;
    const rLin = sumLin / nLin;
    const rRad = nRad > 0 ? sumRad / nRad : Infinity;

    const minResidual = Math.min(rLin, rRad);
    if (minResidual > C.GRADIENT_MAX_MODEL_RESIDUAL) continue;

    const innerAgg = aggs[order[0]];
    const innerAspect = innerAgg.bbox[3] > 0 ? innerAgg.bbox[2] / innerAgg.bbox[3] : 1;
    const isotropic = Math.abs(innerAspect - 1) <= C.GRADIENT_RADIAL_INNER_MAX_ASPECT_DEV;
    const innerCompactness = 4 * Math.PI * (innerAgg.totalArea) / ((2 * (innerAgg.bbox[2] + innerAgg.bbox[3])) ** 2 || 1);
    const radialShapeOk = isotropic && innerCompactness >= C.GRADIENT_RADIAL_INNER_MIN_COMPACTNESS * 0.5; // relaxed vs. a single-path circle test — this is an aggregate band, not one traced circle

    const isRadial = rRad < C.GRADIENT_RADIAL_MARGIN * rLin && radialShapeOk;

    // Stops: offset from geometry (t-hat or r-hat), color from original pixels' mean under the band.
    const stops: GradientStop[] = order.map((idx, rank) => {
      const a = aggs[idx];
      const offset = isRadial
        ? Math.max(0, Math.min(1, Math.hypot(a.centroid.x - centroidExtreme.x, a.centroid.y - centroidExtreme.y) / rMax))
        : Math.max(0, Math.min(1, rank / Math.max(1, K - 1)));
      return { offset, color: rgbToHex(a.color[0], a.color[1], a.color[2]) };
    });

    // Merge stops predicted by linear interpolation of their neighbours within tolerance.
    const reduced: GradientStop[] = [stops[0]];
    for (let i = 1; i < stops.length - 1; i++) {
      const prev = reduced[reduced.length - 1];
      const next = stops[i + 1];
      const t = (stops[i].offset - prev.offset) / (next.offset - prev.offset || 1);
      const predicted = lerpHex(prev.color, next.color, t);
      if (hexDistance(predicted, stops[i].color) > C.GRADIENT_STOP_MERGE_TOLERANCE) reduced.push(stops[i]);
    }
    if (stops.length > 1) reduced.push(stops[stops.length - 1]);

    const angleDeg = ((Math.atan2(geomDir.y, geomDir.x) * 180) / Math.PI + 360) % 360;
    const cssAngle = (angleDeg + 90) % 360;

    const allPaths = aggs.flatMap((a) => a.paths);
    for (const pi of allPaths) ctx.claimed[pi] = 1;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const a of aggs) {
      bx0 = Math.min(bx0, a.bbox[0]); by0 = Math.min(by0, a.bbox[1]);
      bx1 = Math.max(bx1, a.bbox[0] + a.bbox[2]); by1 = Math.max(by1, a.bbox[1] + a.bbox[3]);
    }

    const fCollin = 0.7 + 0.3 * Math.max(0, Math.min(1, (ratio - 0.9) / 0.09));
    const fMono = Math.abs(rho);
    const fModel = 1 - 0.4 * Math.max(0, Math.min(1, minResidual / C.GRADIENT_MAX_MODEL_RESIDUAL));
    // K=3 is the minimum valid chain length, not a weak case — a 2-3 stop
    // gradient is the most common shape a real CSS/design gradient takes.
    // A steeper floor here (originally 0.7) combined multiplicatively with
    // fModel to gate a textbook, perfectly-monotonic 3-stop gradient right
    // below CONFIDENCE_GATE_MIN on the first real fixture this ran against
    // — caught by that fixture, not a theoretical concern.
    const fBands = Math.min(1, 0.85 + 0.05 * (K - 3));
    const confidence = 0.9 * fCollin * fMono * fModel * fBands;

    elements.push({
      id: nextId(),
      kind: "gradient",
      bbox: [bx0, by0, bx1 - bx0, by1 - by0],
      pathIndices: allPaths,
      fill: `linear-gradient(${Math.round(cssAngle)}deg, ${reduced.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ")})`,
      gradient: isRadial
        ? { kind: "radial", angle: 0, stops: reduced, center: centroidExtreme, radius: rMax }
        : { kind: "linear", angle: cssAngle, stops: reduced },
      parentId: null,
      zIndex: 0,
      confidence: Math.max(0, Math.min(1, confidence)),
      confidenceParts: { fCollin, fMono, fModel, fBands },
      name: isRadial ? "Radial gradient" : "Linear gradient",
    });
  }

  return elements;
}

function emitFlatMerge(ctx: DecomposeContext, aggs: LayerAgg[], nextId: () => string, out: DesignElement[]): void {
  const allPaths = aggs.flatMap((a) => a.paths);
  if (allPaths.length === 0) return;
  let totalArea = 0, sr = 0, sg = 0, sb = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const a of aggs) {
    totalArea += a.totalArea;
    sr += a.color[0] * a.totalArea; sg += a.color[1] * a.totalArea; sb += a.color[2] * a.totalArea;
    bx0 = Math.min(bx0, a.bbox[0]); by0 = Math.min(by0, a.bbox[1]);
    bx1 = Math.max(bx1, a.bbox[0] + a.bbox[2]); by1 = Math.max(by1, a.bbox[1] + a.bbox[3]);
  }
  for (const pi of allPaths) ctx.claimed[pi] = 1;
  out.push({
    id: nextId(),
    kind: "shape",
    bbox: [bx0, by0, bx1 - bx0, by1 - by0],
    pathIndices: allPaths,
    fill: totalArea > 0 ? rgbToHex(sr / totalArea, sg / totalArea, sb / totalArea) : "#808080",
    primitive: "Flat fill",
    parentId: null,
    zIndex: 0,
    confidence: 0.85,
    confidenceParts: { flatBandMerge: 1 },
    name: "Flat fill",
  });
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return rgbToHex(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t);
}
function hexDistance(a: string, b: string): number {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2]));
}
function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
