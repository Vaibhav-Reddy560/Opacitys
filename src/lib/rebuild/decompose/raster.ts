/**
 * Even-odd scanline fill treating an outer polygon and its hole polygons as
 * one combined edge list — the same rule trace/svg.ts's rendered output
 * uses (forward outer winding + reversed hole winding), so pixel ownership
 * always matches what actually gets drawn on screen.
 */
export function rasterizePolygonWithHoles(
  outer: Array<{ x: number; y: number }>,
  holes: Array<Array<{ x: number; y: number }>>,
  width: number,
  height: number,
  visit: (x: number, y: number) => void,
): void {
  const rings = [outer, ...holes];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(height - 1, Math.ceil(maxY));

  for (let y = yStart; y <= yEnd; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) {
          const t = (yc - a.y) / (b.y - a.y);
          xs.push(a.x + t * (b.x - a.x));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xStart = Math.max(0, Math.round(xs[i]));
      const xEnd = Math.min(width - 1, Math.round(xs[i + 1]) - 1);
      for (let x = xStart; x <= xEnd; x++) visit(x, y);
    }
  }
}
