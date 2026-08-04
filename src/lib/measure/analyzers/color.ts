import type { TrackAFinding } from "@/lib/critique/types";
import { kmeans2, wcagContrast } from "../ops";
import { newFindingId } from "../id";
import type { TextLine } from "../text-lines";

/**
 * Color analyzer: dominant palette + WCAG contrast between text and its
 * local background, for every detected text line. Port of
 * `services/analyzer/analyzers/color.py`.
 */
const WCAG_AA_NORMAL = 4.5;

export function analyzeColor(
  rgb: Uint8ClampedArray,
  width: number,
  height: number,
  textLines: TextLine[],
): TrackAFinding[] {
  const findings: TrackAFinding[] = [];

  for (const region of textLines) {
    let [x, y, rw, rh] = region.bbox.map((v) => Math.round(v));
    x = Math.max(0, x);
    y = Math.max(0, y);
    rw = Math.max(1, Math.min(rw, width - x));
    rh = Math.max(1, Math.min(rh, height - y));
    const pad = Math.max(4, Math.floor(rh / 2));
    const y0 = Math.max(0, y - pad);
    const y1 = Math.min(height, y + rh + pad);
    const x0 = Math.max(0, x - pad);
    const x1 = Math.min(width, x + rw + pad);
    if (y1 <= y0 || x1 <= x0) continue;

    const patchW = x1 - x0;
    const patchH = y1 - y0;
    const pixels = new Float32Array(patchW * patchH * 3);
    let n = 0;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const src = (py * width + px) * 3;
        pixels[n++] = rgb[src];
        pixels[n++] = rgb[src + 1];
        pixels[n++] = rgb[src + 2];
      }
    }

    const { centers } = kmeans2(pixels, 2);
    const contrast = wcagContrast(centers[0], centers[1]);

    if (contrast < WCAG_AA_NORMAL) {
      findings.push({
        id: newFindingId(),
        dimension: "color",
        severity: contrast < 3.0 ? "critical" : "major",
        bbox: [x, y, rw, rh],
        measured: {
          value: Math.round(contrast * 100) / 100,
          expected: [WCAG_AA_NORMAL, 21.0],
          unit: ":1",
        },
      });
    }
  }

  return findings;
}
