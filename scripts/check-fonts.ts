/**
 * Renders every catalogue font and flags glyphs that don't come out right.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/check-fonts.ts
 *      OUT=/tmp/fonts ... to also write a contact sheet per face.
 *
 * This exists because two separate defects produced *plausible-looking*
 * output rather than an error:
 *
 *   - librsvg silently stopped rendering a long path partway through, so
 *     "CLOSING" rasterised as "CLO" plus half an S with no warning at all.
 *   - Instancing a variable font to a fixed weight left overlapping contours,
 *     and nonzero fill punched a bite out of Archivo 900's "S".
 *
 * Neither throws. Both are only visible by looking, or by measuring — which
 * is what this does: it renders each glyph alone and then in a word, and
 * compares the ink. A glyph that loses ink in company is being dropped or
 * cancelled.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderText } from "../src/lib/rebuild/text/render";
import { FONTS } from "../src/lib/rebuild/fonts/catalog";

const OUT = process.env.OUT;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WORDS = ["CLOSING", "STARTING", "REGISTER", "Sunday", "Design"];
const CAP = 120;

/** Fraction of opaque pixels in a rendered bitmap. */
async function inkRatio(bytes: Buffer): Promise<number> {
  const { data, info } = await sharp(bytes).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 127) on++;
  return on / Math.max(1, info.width * info.height);
}

let failures = 0;

async function main() {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });

  for (const family of FONTS) {
    for (const weight of Object.keys(family.weights).map(Number)) {
      const choice = { family, weight, file: family.weights[weight] };
      const label = `${family.label} ${weight}`;
      const problems: string[] = [];

      // Every letter must produce ink on its own.
      for (const ch of ALPHABET) {
        try {
          const r = await renderText({ text: ch, font: choice, sizePx: CAP, color: { r: 0, g: 0, b: 0 } });
          const ratio = await inkRatio(r.bytes);
          if (ratio < 0.05) problems.push(`"${ch}" rendered almost no ink (${(ratio * 100).toFixed(1)}%)`);
        } catch (err) {
          problems.push(`"${ch}" threw: ${err instanceof Error ? err.message : err}`);
        }
      }

      // A word must carry at least as much ink as its letters do separately,
      // allowing for kerning overlap. Much less means glyphs went missing.
      for (const word of WORDS) {
        if (family.uppercaseOnly && word !== word.toUpperCase()) continue;
        try {
          const whole = await renderText({ text: word, font: choice, sizePx: CAP, color: { r: 0, g: 0, b: 0 } });
          const wholeInk = (await inkRatio(whole.bytes)) * whole.width * whole.height;

          let sumInk = 0;
          for (const ch of word) {
            const one = await renderText({ text: ch, font: choice, sizePx: CAP, color: { r: 0, g: 0, b: 0 } });
            sumInk += (await inkRatio(one.bytes)) * one.width * one.height;
          }
          // 0.85 tolerates per-glyph padding overlap; a dropped glyph in a
          // 7-letter word costs ~14%, well outside it.
          if (wholeInk < sumInk * 0.85) {
            problems.push(
              `"${word}" lost ink vs its letters (${Math.round(wholeInk)} vs ${Math.round(sumInk)}) — glyphs are being dropped`,
            );
          }
          if (OUT) {
            fs.writeFileSync(path.join(OUT, `${family.id}-${weight}-${word}.png`), whole.bytes);
          }
        } catch (err) {
          problems.push(`"${word}" threw: ${err instanceof Error ? err.message : err}`);
        }
      }

      if (problems.length) {
        failures++;
        console.log(`  FAIL  ${label}`);
        for (const p of problems.slice(0, 6)) console.log(`          ${p}`);
        if (problems.length > 6) console.log(`          ...and ${problems.length - 6} more`);
      } else {
        console.log(`  ok    ${label}`);
      }
    }
  }

  console.log(`\n${failures === 0 ? "All faces render correctly." : `${failures} face(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
