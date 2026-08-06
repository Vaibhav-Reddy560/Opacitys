import { maxFilter, minFilter } from "@/lib/measure/ops";
import * as C from "./constants";
import type { DecomposeContext, DesignElement } from "./types";

export interface PhotoStageResult {
  elements: DesignElement[];
  /** True when the whole image collapsed to one full-canvas photo — the pipeline should stop after this stage. */
  degenerate: boolean;
}

interface Region {
  cells: Set<number>;
  minCx: number;
  maxCx: number;
  minCy: number;
  maxCy: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** 3x3 dilate then 3x3 erode over the cell grid, border-clamped so a region touching the canvas edge isn't artificially shrunk. */
function closeGrid(mask: Uint8Array, w: number, h: number): Uint8Array {
  const at = (m: Uint8Array, x: number, y: number) =>
    m[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1 && !v; dx++) if (at(mask, x + dx, y + dy)) v = 1;
      dil[y * w + x] = v;
    }
  }
  const ero = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++) for (let dx = -1; dx <= 1 && v; dx++) if (!at(dil, x + dx, y + dy)) v = 0;
      ero[y * w + x] = v;
    }
  }
  return ero;
}

/**
 * Stage 1. Detects photographic regions FIRST because their shattered
 * paths poison text, gradient and shape detection simultaneously: a photo
 * looks like fragmented "adjacent color bands" (fake gradient), trips the
 * morphological text detector (fake text lines), and would otherwise emit
 * hundreds of "Path N" shapes. Consumes stage 0's relaxed text BOXES (not
 * text grouping, which is stage 2) purely as a veto — dense body copy
 * would otherwise score high on all three photo signals.
 *
 * Three deliberately uncorrelated signals per grid cell: fragmentation
 * (distinct owning paths — the direct evidence "this shattered the
 * vectorizer"), flatness deficit (reuses restraint.ts's own flat-pixel
 * test), and local entropy (32-bin histogram). No single signal can call a
 * photo alone — see constants.ts for the exact weights and thresholds.
 */
export function runPhotoStage(ctx: DecomposeContext, nextId: () => string): PhotoStageResult {
  const { width, height, gray, pixelOwner, relaxedTextBoxes } = ctx;
  const cellSize = Math.max(C.PHOTO_CELL_MIN, Math.round(Math.min(width, height) / C.PHOTO_CELL_DIVISOR));
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);

  const hi = maxFilter(gray, width, height, 3, 3);
  const lo = minFilter(gray, width, height, 3, 3);

  const score = new Float32Array(gridW * gridH);
  const vetoed = new Uint8Array(gridW * gridH);

  for (let cy = 0; cy < gridH; cy++) {
    for (let cx = 0; cx < gridW; cx++) {
      const x0 = cx * cellSize;
      const y0 = cy * cellSize;
      const x1 = Math.min(width, x0 + cellSize);
      const y1 = Math.min(height, y0 + cellSize);
      const cellPixels = (x1 - x0) * (y1 - y0);
      if (cellPixels <= 0) continue;

      const owners = new Set<number>();
      let flat = 0;
      const hist = new Float64Array(32);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = y * width + x;
          const o = pixelOwner[idx];
          if (o >= 0) owners.add(o);
          if (hi[idx] - lo[idx] <= C.PHOTO_FLAT_GRADIENT_MAX) flat++;
          hist[Math.min(31, gray[idx] >> 3)]++;
        }
      }

      const D = clamp01((owners.size - C.PHOTO_FRAG_LO) / (C.PHOTO_FRAG_HI - C.PHOTO_FRAG_LO));
      const G = 1 - flat / cellPixels;
      let H = 0;
      for (let b = 0; b < 32; b++) {
        const p = hist[b] / cellPixels;
        if (p > 0) H -= p * Math.log2(p);
      }
      const E = clamp01((H / Math.log2(32) - C.PHOTO_ENTROPY_LO) / (C.PHOTO_ENTROPY_HI - C.PHOTO_ENTROPY_LO));

      score[cy * gridW + cx] = C.PHOTO_WEIGHT_FRAG * D + C.PHOTO_WEIGHT_FLAT * G + C.PHOTO_WEIGHT_ENTROPY * E;

      let textCovered = 0;
      for (const [tx, ty, tw, th] of relaxedTextBoxes) {
        const ix0 = Math.max(x0, tx);
        const iy0 = Math.max(y0, ty);
        const ix1 = Math.min(x1, tx + tw);
        const iy1 = Math.min(y1, ty + th);
        if (ix1 > ix0 && iy1 > iy0) textCovered += (ix1 - ix0) * (iy1 - iy0);
      }
      if (textCovered / cellPixels >= C.PHOTO_TEXT_VETO_COVERAGE) vetoed[cy * gridW + cx] = 1;
    }
  }

  const rawPhoto = new Uint8Array(gridW * gridH);
  for (let i = 0; i < rawPhoto.length; i++) rawPhoto[i] = !vetoed[i] && score[i] >= C.PHOTO_CELL_SCORE_THRESHOLD ? 1 : 0;
  const isPhoto = closeGrid(rawPhoto, gridW, gridH);

  const visited = new Uint8Array(gridW * gridH);
  const regions: Region[] = [];
  for (let cy = 0; cy < gridH; cy++) {
    for (let cx = 0; cx < gridW; cx++) {
      const start = cy * gridW + cx;
      if (!isPhoto[start] || visited[start]) continue;
      const cells = new Set<number>();
      const stack = [start];
      visited[start] = 1;
      let minCx = cx, maxCx = cx, minCy = cy, maxCy = cy;
      while (stack.length > 0) {
        const idx = stack.pop()!;
        cells.add(idx);
        const px = idx % gridW;
        const py = (idx - px) / gridW;
        if (px < minCx) minCx = px;
        if (px > maxCx) maxCx = px;
        if (py < minCy) minCy = py;
        if (py > maxCy) maxCy = py;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
            const nIdx = ny * gridW + nx;
            if (isPhoto[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              stack.push(nIdx);
            }
          }
        }
      }
      regions.push({ cells, minCx, maxCx, minCy, maxCy });
    }
  }

  const elements: DesignElement[] = [];
  let totalPhotoCells = 0;
  const totalCells = gridW * gridH;

  for (const region of regions) {
    const bboxCells = (region.maxCx - region.minCx + 1) * (region.maxCy - region.minCy + 1);
    const minSide = Math.min(region.maxCx - region.minCx + 1, region.maxCy - region.minCy + 1);
    const canvasFrac = (region.cells.size * cellSize * cellSize) / ctx.canvasArea;
    if (
      region.cells.size < C.PHOTO_REGION_MIN_CELLS ||
      canvasFrac < C.PHOTO_REGION_MIN_CANVAS_FRAC ||
      minSide < C.PHOTO_REGION_MIN_SIDE_CELLS
    ) {
      continue; // photographic texture inside an ornament — not worth an image element
    }

    const cellFill = region.cells.size / bboxCells;
    if (cellFill < C.PHOTO_KEEP_MASK_FILL) continue; // stringy — texture band or chart

    const bx0 = region.minCx * cellSize;
    const by0 = region.minCy * cellSize;
    const bx1 = Math.min(width, (region.maxCx + 1) * cellSize);
    const by1 = Math.min(height, (region.maxCy + 1) * cellSize);
    const rectSnapped = cellFill >= C.PHOTO_SNAP_RECT_FILL;
    totalPhotoCells += region.cells.size;

    const cellSet = region.cells;
    const claimedHere: number[] = [];
    for (const pi of ctx.candidates) {
      if (ctx.claimed[pi]) continue;
      const feat = ctx.features.get(pi)!;
      if (feat.netArea === 0) continue;
      let inRegion = 0;
      const [px0, py0, pw, ph] = ctx.paths[pi].bbox;
      const sx0 = Math.max(0, Math.floor(px0));
      const sy0 = Math.max(0, Math.floor(py0));
      const sx1 = Math.min(width, Math.ceil(px0 + pw));
      const sy1 = Math.min(height, Math.ceil(py0 + ph));
      for (let y = sy0; y < sy1; y++) {
        const cy2 = Math.floor(y / cellSize);
        for (let x = sx0; x < sx1; x++) {
          if (pixelOwner[y * width + x] !== pi) continue;
          const cx2 = Math.floor(x / cellSize);
          if (cellSet.has(cy2 * gridW + cx2)) inRegion++;
        }
      }
      if (inRegion / feat.netArea > C.PHOTO_CLAIM_MAJORITY) claimedHere.push(pi);
    }
    if (claimedHere.length === 0) continue;
    for (const pi of claimedHere) ctx.claimed[pi] = 1;

    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        const idx = (y * width + x) * 3;
        sr += ctx.rgb[idx];
        sg += ctx.rgb[idx + 1];
        sb += ctx.rgb[idx + 2];
        n++;
      }
    }
    const fill = n > 0 ? rgbToHex(sr / n, sg / n, sb / n) : "#808080";

    let cellScoreSum = 0;
    for (const c of region.cells) cellScoreSum += score[c];
    const meanCellScore = cellScoreSum / region.cells.size;
    const fShape = rectSnapped ? 1.0 : 0.85;
    const confidence = Math.min(0.95, 0.5 + 0.5 * meanCellScore) * fShape;

    elements.push({
      id: nextId(),
      kind: "image",
      bbox: [bx0, by0, bx1 - bx0, by1 - by0],
      pathIndices: claimedHere,
      fill,
      parentId: null,
      zIndex: 0,
      confidence,
      confidenceParts: { meanCellScore, fShape },
      name: "Photo",
    });
  }

  if (totalPhotoCells / totalCells >= C.PHOTO_DEGENERATE_COVERAGE) {
    for (const el of elements) for (const pi of el.pathIndices) ctx.claimed[pi] = 0;
    for (const pi of ctx.candidates) ctx.claimed[pi] = 1;
    let sr = 0, sg = 0, sb = 0;
    const n = ctx.rgb.length / 3;
    for (let i = 0; i < ctx.rgb.length; i += 3) {
      sr += ctx.rgb[i];
      sg += ctx.rgb[i + 1];
      sb += ctx.rgb[i + 2];
    }
    return {
      elements: [
        {
          id: nextId(),
          kind: "image",
          bbox: [0, 0, width, height],
          pathIndices: ctx.candidates.slice(),
          fill: rgbToHex(sr / n, sg / n, sb / n),
          parentId: null,
          zIndex: 0,
          confidence: 0.9,
          confidenceParts: { coverage: totalPhotoCells / totalCells },
          name: "Photo",
          degenerate: "photographic",
        },
      ],
      degenerate: true,
    };
  }

  return { elements, degenerate: false };
}
