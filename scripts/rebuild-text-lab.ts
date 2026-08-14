/**
 * Visual lab for Rebuild's deterministic text path.
 *
 * Run: OUT=/tmp/lab npx tsx --tsconfig scripts/tsconfig.json scripts/rebuild-text-lab.ts
 *
 * Runs measure -> identify -> render against the real reference poster, so the
 * match can be judged by eye, which is the only way to judge it. Calls no
 * image model and costs nothing.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderText, fitTracking } from "../src/lib/rebuild/text/render";
import { readTextStyle } from "../src/lib/rebuild/text/read";
import { matchFont } from "../src/lib/rebuild/text/match";

const OUT = process.env.OUT ?? "/tmp/rebuild-lab";
const BEFORE =
  "https://55pny0zfjaduirus.public.blob.vercel-storage.com/rebuild-versions/1530b97f-bf52-418a-b1de-a42b0246d2f3/a58f88fe-2701-4afb-949f-5ea03ce35f15.png";
/** The "STARTING SOON" status message. */
const STATUS: [number, number, number, number] = [761, 1985, 1717, 547];
const ORIGINAL = "STARTING";
const REPLACEMENT = "CLOSING";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const res = await fetch(BEFORE);
  const poster = Buffer.from(await res.arrayBuffer());
  const region = await sharp(poster)
    .extract({ left: STATUS[0], top: STATUS[1], width: STATUS[2], height: STATUS[3] })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT, "00-region.png"), region);

  console.log("\n── Measured from the image ──");
  const style = await readTextStyle(region);
  console.log(`  ink        rgb(${style.color.r}, ${style.color.g}, ${style.color.b})`);
  console.log(`  background rgb(${style.background.r}, ${style.background.g}, ${style.background.b})`);
  style.lines.forEach((l, i) => {
    console.log(
      `  line ${i + 1}  capHeight=${l.inkHeightPx}px  inkWidth=${l.box[2]}px  ` +
        `stroke=${l.strokeRatio.toFixed(3)}  weight≈${l.weight}  caps=${l.isUppercase}`,
    );
  });

  const line = style.lines[0];

  console.log(`\n── Identifying the face from "${ORIGINAL}" at ${line.inkHeightPx}px cap height ──`);
  const matches = await matchFont({ text: ORIGINAL, regionBytes: region, style, line, metric: "cap" });
  for (const m of matches) {
    console.log(
      `  ${(m.choice.family.label + " " + m.choice.weight).padEnd(26)}` +
        `width=${String(Math.round(m.width)).padStart(5)}px (${(m.widthError * 100).toFixed(1)}% off)  ` +
        `shape ${(m.shapeError * 100).toFixed(0)}% off  score=${m.score.toFixed(3)}`,
    );
  }

  const best = matches[0];
  console.log(`\n  -> ${best.choice.family.label} ${best.choice.weight}` +
    (best.choice.family.metricTwin ? `  (metric twin of ${best.choice.family.metricTwin})` : ""));

  console.log(`\n── Rendering "${REPLACEMENT}" in the identified face ──`);
  const tracking = fitTracking({
    text: REPLACEMENT,
    font: best.choice,
    sizePx: line.inkHeightPx,
    targetWidth: line.box[2],
  });
  console.log(`  tracking to fill the original width: ${tracking === null ? "not viable (would stretch)" : tracking.toFixed(4) + "em"}`);

  const rendered = await renderText({
    text: REPLACEMENT,
    font: best.choice,
    sizePx: line.inkHeightPx,
    color: style.color,
  });
  fs.writeFileSync(path.join(OUT, "01-rendered.png"), rendered.bytes);

  // Stack the original word above the replacement at identical cap height so
  // weight, proportion and colour can be compared directly.
  const originalWord = await sharp(region)
    .extract({ left: line.box[0], top: line.box[1], width: line.box[2], height: line.box[3] })
    .png()
    .toBuffer();
  const om = await sharp(originalWord).metadata();
  const gap = 30;
  const compare = await sharp({
    create: {
      width: Math.max(om.width!, rendered.width),
      height: om.height! + gap + rendered.height,
      channels: 3,
      background: style.background,
    },
  })
    .composite([
      { input: originalWord, left: 0, top: 0 },
      { input: rendered.bytes, left: 0, top: om.height! + gap },
    ])
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT, "02-compare.png"), compare);

  console.log(`\nWrote ${OUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
