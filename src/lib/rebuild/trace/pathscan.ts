/**
 * Ported from ImageTracer.js v1.2.6 (https://github.com/jankovicsandras/imagetracerjs),
 * © andras@jankovics.net, released to the Unlicense / public domain — free to
 * copy, modify and redistribute for any purpose. The algorithm (marching
 * squares over a padded, indexed image; a lookup-table walk that consumes
 * boundary nodes into closed paths; point-in-polygon hole/parent matching)
 * is unchanged. Only the data layout changed: flat typed arrays with an
 * explicit row stride, matching this repo's src/lib/measure/ops.ts style,
 * instead of nested JS arrays.
 */

export interface ScanPoint {
  x: number;
  y: number;
  /** The edge-node type (0-15) this point was visited at — consumed by internodes()'s right-angle test. */
  t: number;
}

export interface ScanPath {
  points: ScanPoint[];
  boundingBox: [number, number, number, number]; // minX, minY, maxX, maxY
  /** Indices into the SAME layer's ScanPath[] that are holes inside this path. */
  holeChildren: number[];
  isHole: boolean;
}

// pathscan_combined_lookup[nodeValue][dir] = [nextNodeValue, nextDir, deltaX, deltaY].
// nodeValue 0 (no boundary) and 15 (fully interior) are invalid and never
// looked up — pathscan only starts a walk on 4 or 11. Transcribed verbatim
// from imagetracer.js's this.pathscan_combined_lookup.
const LOOKUP: number[][][] = [
  [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
  [[0, 1, 0, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [0, 2, -1, 0]],
  [[-1, -1, -1, -1], [-1, -1, -1, -1], [0, 1, 0, -1], [0, 0, 1, 0]],
  [[0, 0, 1, 0], [-1, -1, -1, -1], [0, 2, -1, 0], [-1, -1, -1, -1]],

  [[-1, -1, -1, -1], [0, 0, 1, 0], [0, 3, 0, 1], [-1, -1, -1, -1]],
  [[13, 3, 0, 1], [13, 2, -1, 0], [7, 1, 0, -1], [7, 0, 1, 0]],
  [[-1, -1, -1, -1], [0, 1, 0, -1], [-1, -1, -1, -1], [0, 3, 0, 1]],
  [[0, 3, 0, 1], [0, 2, -1, 0], [-1, -1, -1, -1], [-1, -1, -1, -1]],

  [[0, 3, 0, 1], [0, 2, -1, 0], [-1, -1, -1, -1], [-1, -1, -1, -1]],
  [[-1, -1, -1, -1], [0, 1, 0, -1], [-1, -1, -1, -1], [0, 3, 0, 1]],
  [[11, 1, 0, -1], [14, 0, 1, 0], [14, 3, 0, 1], [11, 2, -1, 0]],
  [[-1, -1, -1, -1], [0, 0, 1, 0], [0, 3, 0, 1], [-1, -1, -1, -1]],

  [[0, 0, 1, 0], [-1, -1, -1, -1], [0, 2, -1, 0], [-1, -1, -1, -1]],
  [[-1, -1, -1, -1], [-1, -1, -1, -1], [0, 1, 0, -1], [0, 0, 1, 0]],
  [[0, 1, 0, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [0, 2, -1, 0]],
  [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
];

function pointInPoly(p: { x: number; y: number }, poly: ScanPoint[]): boolean {
  let isin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      isin = !isin;
    }
  }
  return isin;
}

function boundingBoxIncludes(
  parent: [number, number, number, number],
  child: [number, number, number, number],
): boolean {
  return parent[0] < child[0] && parent[1] < child[1] && parent[2] > child[2] && parent[3] > child[3];
}

/**
 * Walks a single color's edge-node layer (from layeringStep) into closed
 * boundary paths, discarding anything shorter than `pathomit` points and
 * attaching hole paths to their innermost enclosing outer path via a
 * bounding-box-then-point-in-polygon test — the real hole/parent hierarchy
 * that makes counters in letters and ring shapes come out right. Mutates a
 * local copy of `layer`; the caller's array is left untouched.
 */
export function pathScan(
  layer: Uint8Array,
  stride: number,
  rows: number,
  pathomit: number,
): ScanPath[] {
  const arr = layer.slice();
  const paths: ScanPath[] = [];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < stride; i++) {
      const startVal = arr[j * stride + i];
      if (startVal !== 4 && startVal !== 11) continue;

      let px = i;
      let py = j;
      const points: ScanPoint[] = [];
      const boundingBox: [number, number, number, number] = [px, py, px, py];
      const isHole = startVal === 11;
      let dir = 1; // ^ (north) — matches ImageTracer's initial walk direction
      let finished = false;
      let discarded = false;

      while (!finished) {
        const t = arr[py * stride + px];
        points.push({ x: px - 1, y: py - 1, t });

        if (px - 1 < boundingBox[0]) boundingBox[0] = px - 1;
        if (px - 1 > boundingBox[2]) boundingBox[2] = px - 1;
        if (py - 1 < boundingBox[1]) boundingBox[1] = py - 1;
        if (py - 1 > boundingBox[3]) boundingBox[3] = py - 1;

        const row = LOOKUP[t][dir];
        arr[py * stride + px] = row[0];
        dir = row[1];
        px += row[2];
        py += row[3];

        if (px - 1 === points[0].x && py - 1 === points[0].y) {
          finished = true;
          if (points.length < pathomit) {
            discarded = true;
            break;
          }
        }
      }

      if (discarded) continue;

      const holeChildren: number[] = [];
      if (isHole) {
        let parentIdx = 0;
        let parentBox: [number, number, number, number] = [-1, -1, stride, rows];
        for (let p = 0; p < paths.length; p++) {
          if (
            !paths[p].isHole &&
            boundingBoxIncludes(paths[p].boundingBox, boundingBox) &&
            boundingBoxIncludes(parentBox, paths[p].boundingBox) &&
            pointInPoly(points[0], paths[p].points)
          ) {
            parentIdx = p;
            parentBox = paths[p].boundingBox;
          }
        }
        paths[parentIdx].holeChildren.push(paths.length);
      }

      paths.push({ points, boundingBox, holeChildren, isHole });
    }
  }

  return paths;
}
