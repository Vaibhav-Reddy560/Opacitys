import { relativeLuminance } from "@/lib/measure/ops";
import * as C from "./constants";
import type { DecomposeContext, DesignElement } from "./types";

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function elementArea(ctx: DecomposeContext, el: DesignElement): number {
  if (el.pathIndices.length === 0) return el.bbox[2] * el.bbox[3];
  return el.pathIndices.reduce((s, pi) => s + (ctx.features.get(pi)?.netArea ?? 0), 0);
}

function centroidOf(el: DesignElement): { x: number; y: number } {
  return { x: el.bbox[0] + el.bbox[2] / 2, y: el.bbox[1] + el.bbox[3] / 2 };
}

function iouBbox(a: [number, number, number, number], b: [number, number, number, number]): number {
  const ax1 = a[0], ay1 = a[1], ax2 = a[0] + a[2], ay2 = a[1] + a[3];
  const bx1 = b[0], by1 = b[1], bx2 = b[0] + b[2], by2 = b[1] + b[3];
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Median 20%->80% grayscale transition width along the outward normal at
 * ~40 sampled boundary points, excluding the side facing `excludeDir` (the
 * direction toward the candidate caster, so an occluded/merged edge isn't
 * counted). A self-calibrating measurement: a hard vector edge measures
 * ~1-1.5px in the working image regardless of resolution; only its RATIO to
 * the image's own median is used downstream, which is what makes it immune
 * to the 1600px downscale and to JPEG softening.
 */
function boundarySoftness(
  ctx: DecomposeContext,
  points: Array<{ x: number; y: number }>,
  excludeDir: { x: number; y: number } | null,
): number {
  const n = points.length;
  if (n < 12) return 1.5;
  const stride = Math.max(1, Math.floor(n / 40));
  const widths: number[] = [];
  const { gray, width, height } = ctx;

  for (let i = 0; i < n; i += stride) {
    const prev = points[(i - 3 + n) % n];
    const next = points[(i + 3) % n];
    let nx = -(next.y - prev.y);
    let ny = next.x - prev.x;
    const norm = Math.hypot(nx, ny) || 1;
    nx /= norm;
    ny /= norm;
    if (excludeDir && nx * excludeDir.x + ny * excludeDir.y > 0.3) continue;

    const p = points[i];
    const samples: number[] = [];
    for (let d = -6; d <= 6; d++) {
      const sx = Math.round(p.x + nx * d);
      const sy = Math.round(p.y + ny * d);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
        samples.push(NaN);
        continue;
      }
      samples.push(gray[sy * width + sx]);
    }
    const valid = samples.filter((v) => !Number.isNaN(v));
    if (valid.length < 4) continue;
    const lo = Math.min(...valid), hi = Math.max(...valid);
    if (hi - lo < 8) continue; // no real edge here to measure
    const t20 = lo + 0.2 * (hi - lo), t80 = lo + 0.8 * (hi - lo);
    let firstCross = -1, lastCross = -1;
    for (let k = 0; k < samples.length; k++) {
      if (Number.isNaN(samples[k])) continue;
      if (samples[k] >= t20 && firstCross === -1) firstCross = k;
      if (samples[k] >= t80) lastCross = k;
    }
    if (firstCross >= 0 && lastCross >= firstCross) widths.push(lastCross - firstCross);
  }
  if (widths.length === 0) return 1.5;
  const s = [...widths].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Stage 5. Runs LAST among classification stages — the test is relational
 * ("is this a blurred offset copy of ANOTHER element"), so the other
 * elements have to exist first. Reclassifies an existing single-path
 * `shape` element into `effect`; never claims raw paths of its own.
 *
 * Deliberately narrow: only drop shadows, gated behind all four tests
 * ANDed (offset-silhouette match, darker-than-local-background, a soft
 * edge relative to this image's own median, and sitting behind the
 * caster), with confidence hard-capped at 0.55. Glow, inner shadow, blur
 * and grain are dropped entirely — they fail for structural reasons a
 * threshold can't fix (a glow isn't darker, an inner shadow has no offset
 * silhouette, blur/grain aren't localized to one path). A false `effect` is
 * destructive (a real shape disappears into "a shadow of something"); an
 * extra shape is merely verbose — that asymmetry is why every test is
 * required, not just enough of them.
 */
export function runEffectStage(ctx: DecomposeContext, elements: DesignElement[]): void {
  const singlePathShapes = elements.filter((el) => el.kind === "shape" && el.pathIndices.length === 1);
  if (singlePathShapes.length === 0) return;

  // Global median softness among single-path shapes — the self-calibrating baseline.
  const baseline = singlePathShapes.map((el) => boundarySoftness(ctx, ctx.paths[el.pathIndices[0]].points, null));
  const sortedBaseline = [...baseline].sort((a, b) => a - b);
  const medianSoftness = sortedBaseline.length > 0 ? sortedBaseline[Math.floor(sortedBaseline.length / 2)] : 1.5;

  for (const shadow of singlePathShapes) {
    const shadowArea = elementArea(ctx, shadow);
    if (shadowArea <= 0) continue;
    const shadowCentroid = centroidOf(shadow);
    const shadowColor = hexToRgb(shadow.fill);

    let best: { caster: DesignElement; iou: number } | null = null;
    for (const caster of elements) {
      if (caster.id === shadow.id || caster.kind === "effect") continue;
      const casterArea = elementArea(ctx, caster);
      if (casterArea < C.EFFECT_CANDIDATE_MIN_CASTER_AREA_RATIO * shadowArea) continue;
      const bboxRatio = Math.max(shadow.bbox[2] * shadow.bbox[3], caster.bbox[2] * caster.bbox[3]) /
        Math.max(1, Math.min(shadow.bbox[2] * shadow.bbox[3], caster.bbox[2] * caster.bbox[3]));
      if (bboxRatio > C.EFFECT_PRUNE_MAX_BBOX_RATIO) continue;

      const casterCentroid = centroidOf(caster);
      const dx = shadowCentroid.x - casterCentroid.x;
      const dy = shadowCentroid.y - casterCentroid.y;
      const offsetMag = Math.hypot(dx, dy);
      if (offsetMag > C.EFFECT_PRUNE_MAX_OFFSET_FRAC * Math.min(ctx.width, ctx.height)) continue;
      if (offsetMag < 0.5) continue; // no offset at all — not a shadow relationship

      // Test 1: offset-silhouette match.
      const translated: [number, number, number, number] = [shadow.bbox[0] - dx, shadow.bbox[1] - dy, shadow.bbox[2], shadow.bbox[3]];
      const iou = iouBbox(translated, caster.bbox);
      if (iou < C.EFFECT_MIN_IOU) continue;

      // Test 2: darker than local background (sampled ring around the shadow, excluding the caster and the shadow itself).
      const [bx, by, bw, bh] = shadow.bbox;
      const ring = { x0: Math.max(0, bx - 6), y0: Math.max(0, by - 6), x1: Math.min(ctx.width, bx + bw + 6), y1: Math.min(ctx.height, by + bh + 6) };
      let bgR = 0, bgG = 0, bgB = 0, bgN = 0;
      const shadowPi = shadow.pathIndices[0];
      const casterPis = new Set(caster.pathIndices);
      for (let y = ring.y0; y < ring.y1; y++) {
        for (let x = ring.x0; x < ring.x1; x++) {
          if (x >= bx && x < bx + bw && y >= by && y < by + bh) continue; // inside shadow bbox
          const owner = ctx.pixelOwner[y * ctx.width + x];
          if (owner === shadowPi || casterPis.has(owner)) continue;
          const idx = (y * ctx.width + x) * 3;
          bgR += ctx.rgb[idx]; bgG += ctx.rgb[idx + 1]; bgB += ctx.rgb[idx + 2];
          bgN++;
        }
      }
      if (bgN < 8) continue;
      const bg: [number, number, number] = [bgR / bgN, bgG / bgN, bgB / bgN];
      const lumShadow = relativeLuminance(shadowColor);
      const lumBg = relativeLuminance(bg);
      if (lumBg <= 0 || lumShadow > C.EFFECT_MAX_LUMINANCE_RATIO * lumBg) continue;
      const spread = (rgb: [number, number, number]) => Math.max(...rgb) - Math.min(...rgb);
      const achromatic = spread(shadowColor) <= C.EFFECT_ACHROMATIC_MAX_CHANNEL_SPREAD;
      if (!achromatic) {
        const hue = (rgb: [number, number, number]) => {
          const [r, g, b] = rgb;
          const maxV = Math.max(r, g, b), minV = Math.min(r, g, b);
          if (maxV === minV) return 0;
          const d = maxV - minV;
          let h = 0;
          if (maxV === r) h = ((g - b) / d) % 6;
          else if (maxV === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          return (h * 60 + 360) % 360;
        };
        const hueDelta = Math.abs(hue(shadowColor) - hue(bg));
        const hueDeltaWrapped = Math.min(hueDelta, 360 - hueDelta);
        if (hueDeltaWrapped > C.EFFECT_MAX_HUE_DELTA) continue;
      }

      // Test 3: soft edge, relative to this image's own median.
      const dirToE = { x: dx !== 0 || dy !== 0 ? -dx / offsetMag : 0, y: dx !== 0 || dy !== 0 ? -dy / offsetMag : 0 };
      const softness = boundarySoftness(ctx, ctx.paths[shadowPi].points, dirToE);
      if (softness < C.EFFECT_SOFTNESS_RATIO * medianSoftness || softness < C.EFFECT_SOFTNESS_FLOOR_PX) continue;

      // Test 4: sits behind — shared boundary on the side facing the caster.
      const neighbors = ctx.adjacency.get(shadowPi);
      const sharedWithCaster = neighbors ? [...caster.pathIndices].reduce((s, pi) => s + (neighbors.get(pi) ?? 0), 0) : 0;
      const shadowPerimeter = ctx.features.get(shadowPi)?.perimeter ?? 0;
      if (shadowPerimeter <= 0 || sharedWithCaster / shadowPerimeter < C.EFFECT_MIN_BEHIND_BOUNDARY_FRAC) continue;

      if (!best || iou > best.iou) best = { caster, iou };
    }

    if (best) {
      const fIou = 0.6 + 0.4 * Math.max(0, Math.min(1, (best.iou - 0.6) / 0.35));
      const softness = boundarySoftness(ctx, ctx.paths[shadow.pathIndices[0]].points, null);
      const fSoft = Math.max(0.4, Math.min(1, softness / 2.5));
      shadow.kind = "effect";
      shadow.primitive = undefined;
      shadow.name = "Drop shadow";
      shadow.parentId = best.caster.id;
      shadow.confidence = Math.min(C.EFFECT_CONFIDENCE_CAP, C.EFFECT_CONFIDENCE_CAP * fIou * fSoft);
      shadow.confidenceParts = { fIou, fSoft };
    }
  }
}
