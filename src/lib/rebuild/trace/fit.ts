/**
 * Ported from ImageTracer.js v1.2.6's internodes()/tracepath()/fitseq()
 * (Unlicense / public domain — see pathscan.ts for the full attribution
 * note). Two steps: interpolate the pixel-boundary walk into 8-direction
 * midpoints (internodes), then recursively fit straight lines and, failing
 * that, quadratic Béziers, splitting at the worst-error point until every
 * segment is within tolerance (tracePath/fitSeq).
 */
import type { ScanPath, ScanPoint } from "./pathscan";

export interface InternodePoint {
  x: number;
  y: number;
  /** 0-7 compass direction to the NEXT point, or 8 (center, degenerate). */
  lineSegment: number;
}

export interface InternodePath {
  points: InternodePoint[];
  boundingBox: [number, number, number, number];
  holeChildren: number[];
  isHole: boolean;
}

export type Segment =
  | { type: "L"; x1: number; y1: number; x2: number; y2: number }
  | { type: "Q"; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };

export interface TracedSubpath {
  segments: Segment[];
  boundingBox: [number, number, number, number];
  holeChildren: number[];
  isHole: boolean;
}

function getDirection(x1: number, y1: number, x2: number, y2: number): number {
  if (x1 < x2) {
    if (y1 < y2) return 1; // SE
    if (y1 > y2) return 7; // NE
    return 0; // E
  }
  if (x1 > x2) {
    if (y1 < y2) return 3; // SW
    if (y1 > y2) return 5; // NW
    return 4; // W
  }
  if (y1 < y2) return 2; // S
  if (y1 > y2) return 6; // N
  return 8; // center, degenerate — shouldn't occur on a real boundary
}

function testRightAngle(points: ScanPoint[], i1: number, i2: number, i3: number, i4: number, i5: number): boolean {
  return (
    (points[i3].x === points[i1].x &&
      points[i3].x === points[i2].x &&
      points[i3].y === points[i4].y &&
      points[i3].y === points[i5].y) ||
    (points[i3].y === points[i1].y &&
      points[i3].y === points[i2].y &&
      points[i3].x === points[i4].x &&
      points[i3].x === points[i5].x)
  );
}

/**
 * Interpolates midpoints between adjacent boundary points, classifying each
 * resulting segment into one of 8 compass directions — the alphabet
 * tracePath()/fitSeq() split runs of matching direction on.
 * `rightAngleEnhance` inserts an extra corner point at exact right angles so
 * a vector rectangle traces with 4 sharp corners instead of a rounded one.
 */
export function internodes(path: ScanPath, rightAngleEnhance: boolean): InternodePath {
  const out: InternodePoint[] = [];
  const points = path.points;
  const n = points.length;

  for (let pcnt = 0; pcnt < n; pcnt++) {
    const nextIdx = (pcnt + 1) % n;
    const nextIdx2 = (pcnt + 2) % n;
    const prevIdx = (pcnt - 1 + n) % n;
    const prevIdx2 = (pcnt - 2 + n) % n;

    if (rightAngleEnhance && testRightAngle(points, prevIdx2, prevIdx, pcnt, nextIdx, nextIdx2)) {
      if (out.length > 0) {
        const last = out[out.length - 1];
        last.lineSegment = getDirection(last.x, last.y, points[pcnt].x, points[pcnt].y);
      }
      out.push({
        x: points[pcnt].x,
        y: points[pcnt].y,
        lineSegment: getDirection(
          points[pcnt].x,
          points[pcnt].y,
          (points[pcnt].x + points[nextIdx].x) / 2,
          (points[pcnt].y + points[nextIdx].y) / 2,
        ),
      });
    }

    const mx = (points[pcnt].x + points[nextIdx].x) / 2;
    const my = (points[pcnt].y + points[nextIdx].y) / 2;
    const nmx = (points[nextIdx].x + points[nextIdx2].x) / 2;
    const nmy = (points[nextIdx].y + points[nextIdx2].y) / 2;
    out.push({ x: mx, y: my, lineSegment: getDirection(mx, my, nmx, nmy) });
  }

  return { points: out, boundingBox: path.boundingBox, holeChildren: path.holeChildren, isHole: path.isHole };
}

/**
 * Recursively fits a straight line, then (on failure) a quadratic Bézier
 * through the point of worst deviation, then (on failure) splits the
 * sequence there and recurses on both halves. `seqStart`/`seqEnd` are
 * indices into `points`, wrapping modulo `points.length` — the path is
 * closed.
 */
function fitSeq(points: InternodePoint[], ltres: number, qtres: number, seqStart: number, seqEnd: number): Segment[] {
  if (seqEnd > points.length || seqEnd < 0) return [];
  const n = points.length;

  let tl = seqEnd - seqStart;
  if (tl < 0) tl += n;
  const vx = (points[seqEnd].x - points[seqStart].x) / tl;
  const vy = (points[seqEnd].y - points[seqStart].y) / tl;

  // Straight-line fit.
  let errorPoint = seqStart;
  let errorVal = 0;
  let curvePass = true;
  let pcnt = (seqStart + 1) % n;
  while (pcnt !== seqEnd) {
    let pl = pcnt - seqStart;
    if (pl < 0) pl += n;
    const px = points[seqStart].x + vx * pl;
    const py = points[seqStart].y + vy * pl;
    const dist2 = (points[pcnt].x - px) ** 2 + (points[pcnt].y - py) ** 2;
    if (dist2 > ltres) curvePass = false;
    if (dist2 > errorVal) {
      errorPoint = pcnt;
      errorVal = dist2;
    }
    pcnt = (pcnt + 1) % n;
  }
  if (curvePass) {
    return [{ type: "L", x1: points[seqStart].x, y1: points[seqStart].y, x2: points[seqEnd].x, y2: points[seqEnd].y }];
  }

  // Quadratic fit through the worst straight-line error point.
  const fitPoint = errorPoint;
  curvePass = true;
  errorVal = 0;
  const t = (fitPoint - seqStart) / tl;
  const t1 = (1 - t) * (1 - t);
  const t2 = 2 * (1 - t) * t;
  const t3 = t * t;
  const cpx = (t1 * points[seqStart].x + t3 * points[seqEnd].x - points[fitPoint].x) / -t2;
  const cpy = (t1 * points[seqStart].y + t3 * points[seqEnd].y - points[fitPoint].y) / -t2;

  pcnt = seqStart + 1;
  while (pcnt !== seqEnd) {
    const tt = (pcnt - seqStart) / tl;
    const u1 = (1 - tt) * (1 - tt);
    const u2 = 2 * (1 - tt) * tt;
    const u3 = tt * tt;
    const px = u1 * points[seqStart].x + u2 * cpx + u3 * points[seqEnd].x;
    const py = u1 * points[seqStart].y + u2 * cpy + u3 * points[seqEnd].y;
    const dist2 = (points[pcnt].x - px) ** 2 + (points[pcnt].y - py) ** 2;
    if (dist2 > qtres) curvePass = false;
    if (dist2 > errorVal) {
      errorPoint = pcnt;
      errorVal = dist2;
    }
    pcnt = (pcnt + 1) % n;
  }
  if (curvePass) {
    return [
      { type: "Q", x1: points[seqStart].x, y1: points[seqStart].y, x2: cpx, y2: cpy, x3: points[seqEnd].x, y3: points[seqEnd].y },
    ];
  }

  // Neither fit worked — split at the worst point and recurse.
  const splitPoint = fitPoint;
  return [...fitSeq(points, ltres, qtres, seqStart, splitPoint), ...fitSeq(points, ltres, qtres, splitPoint, seqEnd)];
}

/**
 * Splits the interpolated path into runs of at-most-2 direction types, then
 * fits each run via fitSeq. `ltres`/`qtres` are squared-distance error
 * tolerances for the straight-line and quadratic passes respectively.
 */
export function tracePath(path: InternodePath, ltres: number, qtres: number): TracedSubpath {
  const segments: Segment[] = [];
  const points = path.points;
  let pcnt = 0;

  while (pcnt < points.length) {
    const segType1 = points[pcnt].lineSegment;
    let segType2 = -1;
    let seqEnd = pcnt + 1;
    while (
      (points[seqEnd].lineSegment === segType1 || points[seqEnd].lineSegment === segType2 || segType2 === -1) &&
      seqEnd < points.length - 1
    ) {
      if (points[seqEnd].lineSegment !== segType1 && segType2 === -1) segType2 = points[seqEnd].lineSegment;
      seqEnd++;
    }
    if (seqEnd === points.length - 1) seqEnd = 0;

    segments.push(...fitSeq(points, ltres, qtres, pcnt, seqEnd));
    pcnt = seqEnd > 0 ? seqEnd : points.length;
  }

  return { segments, boundingBox: path.boundingBox, holeChildren: path.holeChildren, isHole: path.isHole };
}
