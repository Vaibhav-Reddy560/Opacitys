/**
 * Palette rollup for Fingerprint.
 *
 * The problem: `MeasuredFacts.dominantColors` holds exact hex strings from
 * per-image k-means. Two designs using "the same" warm red will produce
 * #c1392b and #bd3a2f — so counting exact hexes finds nothing, and every
 * swatch looks like a one-off.
 *
 * The fix: bucket by hue. Twelve 30-degree bins plus a neutral bin for
 * anything under a saturation floor (greys, near-blacks, paper whites, which
 * have a meaningless hue and would otherwise scatter across all twelve).
 * Each bucket reports the mean of its members as the swatch, so the color
 * shown is genuinely representative rather than an arbitrary pick.
 *
 * Deliberately deterministic — no model. Fingerprint is the evidence
 * feature; a palette a model "read off" the work would be exactly the
 * invented precision this product exists to argue against.
 */

const NEUTRAL = "neutral";
const BUCKET_DEGREES = 30;
/** Below this saturation, hue is noise — see the module note above. */
const SATURATION_FLOOR = 0.12;

export interface PaletteBucket {
  /** "neutral", or the bin's centre hue in degrees as a string ("30", "60", …). */
  bucket: string;
  /** Human label for the bin — what a designer would actually call it. */
  label: string;
  /** Mean of the bucket's members, as hex. The swatch actually rendered. */
  hex: string;
  /** How many dominant-color entries landed here, across all pieces. */
  count: number;
}

const HUE_LABELS: [number, string][] = [
  [0, "Red"],
  [30, "Orange"],
  [60, "Yellow"],
  [90, "Lime"],
  [120, "Green"],
  [150, "Teal"],
  [180, "Cyan"],
  [210, "Azure"],
  [240, "Blue"],
  [270, "Violet"],
  [300, "Magenta"],
  [330, "Rose"],
];

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Hue in degrees (0-360) and saturation (0-1), HSL-style. */
function hueSat(r: number, g: number, b: number): { hue: number; sat: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const light = (max + min) / 2;

  if (delta === 0) return { hue: 0, sat: 0 };

  const sat = delta / (1 - Math.abs(2 * light - 1) || 1);

  let hue: number;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  hue = hue * 60;
  if (hue < 0) hue += 360;

  return { hue, sat };
}

/**
 * Buckets every dominant color across a user's pieces, most-used first.
 * `hexes` is the flattened concatenation of every `facts.dominantColors`.
 */
export function bucketPalette(hexes: string[], limit = 8): PaletteBucket[] {
  // bucket -> running sum, so the swatch is the members' mean rather than
  // whichever member happened to arrive first.
  const acc = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (const hex of hexes) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const [r, g, b] = rgb;
    const { hue, sat } = hueSat(r, g, b);

    const key =
      sat < SATURATION_FLOOR
        ? NEUTRAL
        : String(Math.floor(hue / BUCKET_DEGREES) * BUCKET_DEGREES);

    const cur = acc.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    cur.r += r;
    cur.g += g;
    cur.b += b;
    cur.count += 1;
    acc.set(key, cur);
  }

  return [...acc.entries()]
    .map(([bucket, v]) => ({
      bucket,
      label:
        bucket === NEUTRAL
          ? "Neutral"
          : (HUE_LABELS.find(([deg]) => deg === Number(bucket))?.[1] ?? `${bucket}°`),
      hex: rgbToHex(v.r / v.count, v.g / v.count, v.b / v.count),
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
