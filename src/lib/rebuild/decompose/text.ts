import * as C from "./constants";
import type { DecomposeContext, DesignElement } from "./types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Coverage of candidate path `pi` inside box [x,y,w,h] — |owned pixels in box| / path's own net area. Asymmetric on purpose: the question is "is this glyph essentially inside the line", not IoU (which is ~0.01 for a legitimate glyph against its line box). */
function coverageInBox(ctx: DecomposeContext, pi: number, box: [number, number, number, number]): number {
  const feat = ctx.features.get(pi);
  if (!feat || feat.netArea === 0) return 0;
  const [bx, by, bw, bh] = box;
  const [px, py, pw, ph] = ctx.paths[pi].bbox;
  const sx0 = Math.max(0, Math.floor(Math.max(bx, px)));
  const sy0 = Math.max(0, Math.floor(Math.max(by, py)));
  const sx1 = Math.min(ctx.width, Math.ceil(Math.min(bx + bw, px + pw)));
  const sy1 = Math.min(ctx.height, Math.ceil(Math.min(by + bh, py + ph)));
  if (sx1 <= sx0 || sy1 <= sy0) return 0;
  let count = 0;
  for (let y = sy0; y < sy1; y++) {
    for (let x = sx0; x < sx1; x++) {
      if (ctx.pixelOwner[y * ctx.width + x] === pi) count++;
    }
  }
  return count / feat.netArea;
}

interface LineResult {
  element: DesignElement;
  box: [number, number, number, number];
}

/**
 * Stage 2. One `text` element per detected line (not per paragraph — the
 * detector's evidence is per line; a paragraph element would assert
 * something never measured). A separate block pass afterward merges
 * consecutive aligned lines into a parent that owns no paths of its own —
 * order.ts's generic containment logic nests the lines under it, since the
 * parent's bbox is their union by construction.
 *
 * Runs after stage 1 (photo) so photographic paths never reach here, and
 * before gradient/shape so dark type sitting on a card can't be mistaken
 * for an extra color band.
 */
export function runTextStage(ctx: DecomposeContext, nextId: () => string): DesignElement[] {
  const lines: LineResult[] = [];

  for (const box of ctx.relaxedTextBoxes) {
    const [bx, by, bw, bh] = box;
    if (bw <= 0 || bh <= 0) continue;

    // Broad-phase: unclaimed candidates whose bbox overlaps the line box at all.
    const broad: number[] = [];
    for (const pi of ctx.candidates) {
      if (ctx.claimed[pi]) continue;
      const [px, py, pw, ph] = ctx.paths[pi].bbox;
      if (px < bx + bw && px + pw > bx && py < by + bh && py + ph > by) broad.push(pi);
    }
    if (broad.length === 0) continue;

    // Rough "ink in box" proxy for f_cov's denominator, before T1-T3 narrow
    // the set. Same stroke-width floor as T1 below, for the same reason:
    // without it, AA-fringe slivers inflate this into "everything vaguely
    // inside the box" rather than "the real ink", and f_cov gets floor-
    // clamped on every line regardless of how complete the real capture was.
    const inkCandidates = broad.filter(
      (pi) => coverageInBox(ctx, pi, box) >= 0.3 && ctx.features.get(pi)!.strokeWidth > C.TEXT_HALO_MAX_STROKE,
    );
    const totalInkArea = inkCandidates.reduce((s, pi) => s + ctx.features.get(pi)!.netArea, 0);

    // T0: coverage gate.
    let accepted = broad.filter((pi) => coverageInBox(ctx, pi, box) >= C.TEXT_GLYPH_COVERAGE);

    // T1: size gate.
    const shortLine = bw <= C.TEXT_GLYPH_SHORT_LINE_ASPECT * bh;
    accepted = accepted.filter((pi) => {
      const [, , , ph] = ctx.paths[pi].bbox;
      const feat = ctx.features.get(pi)!;
      const lineArea = bw * bh;
      // A stroke-width floor, not just the upper-bound tests above: on a
      // colorful or gradient background, anti-aliasing along every letter
      // edge produces dozens of thin (~1px) same-line-box slivers that pass
      // coverage easily since they're tiny and fully inside the box. Left
      // in, they dominate T2's candidate population BY VOLUME and drag the
      // median stroke width down until the real, thicker glyph ink reads as
      // the outlier and gets rejected — confirmed on a white-text-on-
      // gradient fixture where every real letter failed T2 for exactly this
      // reason. A real letter stroke is never this thin at any font size
      // this detector's own min line height (8px) can resolve; halo
      // absorption (below) picks these slivers back up once real glyphs
      // are accepted, so nothing here is lost, only kept out of the median.
      // The shortLine exception exists for a real single/double-character
      // line (a big "I" or "1" legitimately fills most of its own tight
      // line box) — but the relaxed text-line detector is a morphological-
      // gradient detector, not a real classifier, and will occasionally
      // draw a near-square box around a solid circle or icon whose edge
      // contrast happens to look line-shaped. A circle's compactness alone
      // catches that case: no real letterform is this circular, so the
      // exception is withheld exactly where it would misfire — confirmed
      // against a fixture where a plain red circle was otherwise claimed as
      // a "text line" through this exact escape hatch.
      const notCircular = feat.compactness < C.SHAPE_CIRCLE_MIN_COMPACTNESS;
      return (
        ph <= C.TEXT_GLYPH_MAX_HEIGHT_RATIO * bh &&
        (feat.netArea <= C.TEXT_GLYPH_MAX_AREA_SHARE * lineArea || (shortLine && notCircular)) &&
        feat.strokeWidth > C.TEXT_HALO_MAX_STROKE
      );
    });

    // T2: stroke-width consistency — the genuine-small-shape guard.
    if (accepted.length > 0) {
      const strokes = accepted.map((pi) => ctx.features.get(pi)!.strokeWidth);
      const areas = accepted.map((pi) => ctx.features.get(pi)!.netArea);
      const swMedian = median(strokes);
      const areaMedian = median(areas);
      accepted = accepted.filter((pi) => {
        const f = ctx.features.get(pi)!;
        const strokeOutlier = f.strokeWidth > C.TEXT_STROKE_OUTLIER_RATIO * swMedian;
        const areaOutlier = f.netArea > C.TEXT_AREA_OUTLIER_RATIO * areaMedian;
        return !(strokeOutlier && areaOutlier);
      });
    }

    // T3: color coherence — modal layer by summed area, reject far-off-color minority layers.
    if (accepted.length > 0) {
      const layerArea = new Map<number, number>();
      const layerColor = new Map<number, [number, number, number]>();
      for (const pi of accepted) {
        const p = ctx.paths[pi];
        const f = ctx.features.get(pi)!;
        layerArea.set(p.layerIndex, (layerArea.get(p.layerIndex) ?? 0) + f.netArea);
        layerColor.set(p.layerIndex, p.color);
      }
      let modalLayer = -1;
      let modalArea = -1;
      for (const [layer, area] of layerArea) if (area > modalArea) { modalArea = area; modalLayer = layer; }
      const modalColor = layerColor.get(modalLayer)!;
      accepted = accepted.filter((pi) => {
        const p = ctx.paths[pi];
        if (p.layerIndex === modalLayer) return true;
        return rgbDistance(p.color, modalColor) < C.TEXT_COLOR_DISTANCE;
      });
    }

    if (accepted.length === 0) continue;

    // Touching-glyph detection: an unclaimed candidate with partial coverage
    // that extends well past the line vertically is a glyph fused with a
    // same-color shape by the tracer. Don't attempt to split the path — leave
    // it unclaimed for the shape stage, and penalize this line's confidence.
    let hadTouchingGlyph = false;
    for (const pi of broad) {
      if (accepted.includes(pi)) continue;
      const cov = coverageInBox(ctx, pi, box);
      const [, , , ph] = ctx.paths[pi].bbox;
      if (cov >= C.TEXT_TOUCHING_COVERAGE_LO && cov < C.TEXT_GLYPH_COVERAGE && ph > C.TEXT_TOUCHING_VERTICAL_OVERSHOOT * bh) {
        hadTouchingGlyph = true;
      }
    }

    // Anti-alias halo absorption: thin, unclaimed paths adjacent to an
    // accepted glyph and close in color to it are quantization fringe, not
    // separate ink — absorbed silently, no vote in any median above.
    const haloAbsorbed: number[] = [];
    const inkColorSum: [number, number, number] = [0, 0, 0];
    let inkWeight = 0;
    for (const pi of accepted) {
      const p = ctx.paths[pi];
      const f = ctx.features.get(pi)!;
      inkColorSum[0] += p.color[0] * f.netArea;
      inkColorSum[1] += p.color[1] * f.netArea;
      inkColorSum[2] += p.color[2] * f.netArea;
      inkWeight += f.netArea;
    }
    const inkColor: [number, number, number] =
      inkWeight > 0 ? [inkColorSum[0] / inkWeight, inkColorSum[1] / inkWeight, inkColorSum[2] / inkWeight] : [0, 0, 0];
    for (const pi of accepted) {
      const neighbors = ctx.adjacency.get(pi);
      if (!neighbors) continue;
      for (const [nb, shared] of neighbors) {
        if (ctx.claimed[nb] || accepted.includes(nb) || haloAbsorbed.includes(nb)) continue;
        const nf = ctx.features.get(nb);
        const np = ctx.paths[nb];
        if (!nf || nf.strokeWidth > C.TEXT_HALO_MAX_STROKE) continue;
        if (rgbDistance(np.color, inkColor) > 40) continue; // simplified color-axis proxy — see module note
        const nPerimeterShare = nf.perimeter > 0 ? shared / nf.perimeter : 0;
        if (nPerimeterShare >= C.TEXT_HALO_MIN_SHARED_BOUNDARY) haloAbsorbed.push(nb);
      }
    }

    const claimedArea = accepted.reduce((s, pi) => s + ctx.features.get(pi)!.netArea, 0);
    if (claimedArea / (bw * bh) < C.TEXT_MIN_LINE_COVERAGE) continue;

    for (const pi of accepted) ctx.claimed[pi] = 1;
    for (const pi of haloAbsorbed) ctx.claimed[pi] = 1;
    const allOwned = [...accepted, ...haloAbsorbed];

    // Element bbox = union of CLAIMED path bboxes, not the detector box — the
    // detector box is a morphological dilation and overstates the true bounds.
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    for (const pi of accepted) {
      const [px, py, pw, ph] = ctx.paths[pi].bbox;
      ux0 = Math.min(ux0, px);
      uy0 = Math.min(uy0, py);
      ux1 = Math.max(ux1, px + pw);
      uy1 = Math.max(uy1, py + ph);
    }

    const strokes = accepted.map((pi) => ctx.features.get(pi)!.strokeWidth);
    const swMean = strokes.reduce((a, b) => a + b, 0) / strokes.length;
    const swStd = Math.sqrt(strokes.reduce((s, v) => s + (v - swMean) ** 2, 0) / strokes.length);
    const swCV = swMean > 0 ? swStd / swMean : 0;

    const layerAreaFinal = new Map<number, number>();
    for (const pi of accepted) {
      const p = ctx.paths[pi];
      layerAreaFinal.set(p.layerIndex, (layerAreaFinal.get(p.layerIndex) ?? 0) + ctx.features.get(pi)!.netArea);
    }
    let modalAreaFinal = -1;
    for (const area of layerAreaFinal.values()) if (area > modalAreaFinal) modalAreaFinal = area;
    const outsideModalShare = claimedArea > 0 ? (claimedArea - modalAreaFinal) / claimedArea : 0;

    const fCov = totalInkArea > 0 ? Math.max(0.5, Math.min(1, claimedArea / totalInkArea)) : 0.5;
    // Real multi-letter words have real cross-glyph stroke-width variation
    // (an "O" is a hollow ring, an "L" is a solid bar — very different
    // area/perimeter ratios) — a 25-30% CV is normal typography, not
    // evidence of a bad capture, confirmed against an actual traced "HELLO"
    // where every one of its 5 letters was correctly claimed. Halved from a
    // 1:1 penalty so normal variation doesn't read as materially uncertain.
    const fStroke = 1 - 0.5 * Math.max(0, Math.min(0.4, swCV));
    const fColor = 1 - 0.3 * outsideModalShare;
    // Same reasoning: a poster/logo headline routinely exceeds 12% of a
    // compact canvas's height, which is the exact case Rebuild targets —
    // softened from a flat 0.8 to 0.9 so a large-but-correctly-read
    // headline isn't penalized as heavily as genuinely uncertain evidence.
    const fSize = bh >= 8 && bh <= 0.12 * ctx.height ? 1.0 : 0.9;
    let confidence = 0.95 * fCov * fStroke * fColor * fSize;
    if (hadTouchingGlyph) confidence -= C.TEXT_TOUCHING_PENALTY;
    confidence = Math.max(0, Math.min(1, confidence));

    const fill = rgbToHex(inkColor[0], inkColor[1], inkColor[2]);
    const elBox: [number, number, number, number] = [ux0, uy0, ux1 - ux0, uy1 - uy0];

    lines.push({
      element: {
        id: nextId(),
        kind: "text",
        bbox: elBox,
        pathIndices: allOwned,
        fill,
        parentId: null,
        zIndex: 0,
        confidence,
        confidenceParts: { fCov, fStroke, fColor, fSize, touchingPenalty: hadTouchingGlyph ? C.TEXT_TOUCHING_PENALTY : 0 },
        name: "Text line",
      },
      box: elBox,
    });
  }

  // Block pass: merge consecutive aligned, evenly-spaced, same-size lines
  // into a parent that owns no paths — order.ts nests the lines under it
  // via ordinary bbox containment, since the union always contains them.
  lines.sort((a, b) => a.box[1] - b.box[1]);
  const blocks: DesignElement[] = [];
  let run: LineResult[] = [];

  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    for (const r of run) {
      ux0 = Math.min(ux0, r.box[0]);
      uy0 = Math.min(uy0, r.box[1]);
      ux1 = Math.max(ux1, r.box[0] + r.box[2]);
      uy1 = Math.max(uy1, r.box[1] + r.box[3]);
    }
    const avgConfidence = run.reduce((s, r) => s + r.element.confidence, 0) / run.length;
    blocks.push({
      id: nextId(),
      kind: "text",
      bbox: [ux0, uy0, ux1 - ux0, uy1 - uy0],
      pathIndices: [],
      fill: run[0].element.fill,
      parentId: null,
      zIndex: 0,
      confidence: avgConfidence,
      confidenceParts: { lines: run.length },
      name: "Text block",
    });
    run = [];
  };

  for (const line of lines) {
    if (run.length === 0) {
      run.push(line);
      continue;
    }
    const prev = run[run.length - 1];
    const [px, py, pw, ph] = prev.box;
    const [cx, cy, cw, ch] = line.box;
    const edgeTol = C.TEXT_BLOCK_EDGE_TOLERANCE_FRAC * ctx.width;
    const leftAligned = Math.abs(px - cx) <= edgeTol;
    const centerAligned = Math.abs(px + pw / 2 - (cx + cw / 2)) <= edgeTol;
    const gap = cy - (py + ph);
    const medianH = (ph + ch) / 2;
    const gapOk = gap >= 0 && gap <= C.TEXT_BLOCK_MAX_GAP_RATIO * medianH;
    const heightRatio = ph > 0 ? ch / ph : 0;
    const sizeOk = heightRatio >= C.TEXT_BLOCK_HEIGHT_RATIO_LO && heightRatio <= C.TEXT_BLOCK_HEIGHT_RATIO_HI;
    const overlap = Math.min(px + pw, cx + cw) - Math.max(px, cx);
    const overlapOk = overlap >= C.TEXT_BLOCK_MIN_H_OVERLAP * Math.min(pw, cw);

    if ((leftAligned || centerAligned) && gapOk && sizeOk && overlapOk) {
      run.push(line);
    } else {
      flush();
      run.push(line);
    }
  }
  flush();

  return [...lines.map((l) => l.element), ...blocks];
}
