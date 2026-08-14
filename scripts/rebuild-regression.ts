/**
 * Rebuild edit-pipeline regression checks.
 *
 * Run: npx tsx scripts/rebuild-regression.ts
 *
 * These use the USER'S OWN failed edit as the fixture — the pair of images
 * already sitting in Blob storage from the 2026-08-13 run that reported
 * success while changing 0.0567% of the frame. If the verification gate can't
 * catch that exact case, it isn't worth having.
 *
 * Deliberately calls no image model: every check here is local geometry and
 * pixel maths, so it costs nothing and can run on every change.
 */
import sharp from "sharp";
import { measureChange } from "../src/lib/rebuild/verify";
import { applyTextEdit } from "../src/lib/rebuild/text/apply";
import { readTextStyle } from "../src/lib/rebuild/text/read";
import { renderText } from "../src/lib/rebuild/text/render";
import { findFamily } from "../src/lib/rebuild/fonts/catalog";

const BEFORE = "https://55pny0zfjaduirus.public.blob.vercel-storage.com/rebuild-versions/1530b97f-bf52-418a-b1de-a42b0246d2f3/a58f88fe-2701-4afb-949f-5ea03ce35f15.png";
const AFTER = "https://55pny0zfjaduirus.public.blob.vercel-storage.com/rebuild-versions/1530b97f-bf52-418a-b1de-a42b0246d2f3/59ccc56a-f2bb-4a1d-9839-d3201f36f793.png";

/** The registration button — the layer that edit actually targeted. */
const BUTTON: [number, number, number, number] = [632, 2916, 1976, 324];
/** The "STARTING SOON" status message. */
const STATUS: [number, number, number, number] = [761, 1985, 1717, 547];

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
  if (!ok) failures++;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log("\n── Fixture: the 2026-08-13 edit that reported success ──");
  const [before, after] = await Promise.all([fetchBytes(BEFORE), fetchBytes(AFTER)]);

  const onButton = await measureChange(before, after, BUTTON);
  check(
    "the known no-op is rejected",
    onButton.landed === false,
    `landed=${onButton.landed} strong=${(onButton.strongRatio * 100).toFixed(4)}% ` +
      `changed=${(onButton.changedRatio * 100).toFixed(4)}% changedBox=${onButton.changedBox}`,
  );

  const onStatus = await measureChange(before, after, STATUS);
  check(
    "the text the user actually asked about is untouched",
    onStatus.strongRatio === 0,
    `strong=${(onStatus.strongRatio * 100).toFixed(4)}% inside [${STATUS}]`,
  );

  const whole = await measureChange(before, after, null);
  check(
    "whole-frame view also reads as a no-op",
    whole.landed === false,
    `landed=${whole.landed} strong=${(whole.strongRatio * 100).toFixed(4)}%`,
  );

  console.log("\n── A real edit must pass the same gate ──");
  // Synthesise an honest edit: paint the status-message box out. This is the
  // shape of a genuine text replacement (ink appearing/disappearing), and it
  // must clear the threshold that the no-op above fails.
  const patch = await sharp({
    create: { width: STATUS[2], height: STATUS[3], channels: 3, background: { r: 240, g: 240, b: 245 } },
  })
    .png()
    .toBuffer();
  const edited = await sharp(before)
    .composite([{ input: patch, left: STATUS[0], top: STATUS[1] }])
    .png()
    .toBuffer();

  const real = await measureChange(before, edited, STATUS);
  check(
    "a genuine change is accepted",
    real.landed === true,
    `landed=${real.landed} strong=${(real.strongRatio * 100).toFixed(2)}%`,
  );
  check(
    "and it reports no bleed outside the selection",
    real.bleedRatio === 0,
    `bleed=${real.bleedRatio}`,
  );

  console.log("\n── The deterministic text path, on the edit that failed ──");
  // Mirrors edit.ts: pad the layer box before working on it. Detection clips
  // the extremes of a glyph, and erasing inside a clipped box leaves slivers
  // of the original letters standing outside it.
  const PAD = 0.15;
  const px = Math.round(STATUS[0] - STATUS[2] * PAD);
  const py = Math.round(STATUS[1] - STATUS[3] * PAD);
  const pw = Math.round(STATUS[2] * (1 + 2 * PAD));
  const ph = Math.round(STATUS[3] * (1 + 2 * PAD));

  const regionBefore = await sharp(before)
    .extract({ left: px, top: py, width: pw, height: ph })
    .png()
    .toBuffer();
  const result = await applyTextEdit({ regionBytes: regionBefore, fromText: "STARTING", toText: "CLOSING" });
  const rebuilt = await sharp(before)
    .composite([{ input: result.bytes, left: px, top: py }])
    .png()
    .toBuffer();

  const meta = await sharp(rebuilt).metadata();
  check(
    "the source's full resolution survives the edit",
    meta.width === 3240 && meta.height === 4050,
    `${meta.width}x${meta.height} (a generative round-trip returns ~1MP)`,
  );

  const textReport = await measureChange(before, rebuilt, STATUS);
  check(
    "the edit registers as real",
    textReport.landed,
    `strong=${(textReport.strongRatio * 100).toFixed(2)}% using ${result.font.family.label} ${result.font.weight}`,
  );

  const styleBefore = await readTextStyle(regionBefore);
  const styleAfter = await readTextStyle(
    await sharp(rebuilt).extract({ left: px, top: py, width: pw, height: ph }).png().toBuffer(),
  );
  const drift = Math.abs(styleAfter.lines[0].baselineY - styleBefore.lines[0].baselineY);
  check("the replacement sits on the original baseline", drift <= 2, `drift ${drift}px`);

  const widthErr =
    Math.abs(styleAfter.lines[0].box[2] - styleBefore.lines[0].box[2]) / styleBefore.lines[0].box[2];
  check(
    "and fills the width the original occupied",
    widthErr <= 0.03,
    `${(widthErr * 100).toFixed(1)}% off (${styleBefore.lines[0].box[2]}px -> ${styleAfter.lines[0].box[2]}px)`,
  );

  // The second line must be untouched — erasing one line of a block must not
  // disturb its neighbours.
  const line2Drift = Math.abs((styleAfter.lines[1]?.baselineY ?? 0) - (styleBefore.lines[1]?.baselineY ?? 0));
  check("the line below it does not move", line2Drift === 0, `"SOON" baseline drift ${line2Drift}px`);

  // Editing the SECOND line of a two-line block must not rewrite the first.
  // "Edit the biggest line" looked reasonable and silently rewrote "STARTING"
  // when asked to change "SOON".
  const line2 = await applyTextEdit({ regionBytes: regionBefore, fromText: "SOON", toText: "TODAY" });
  const styleLine2 = await readTextStyle(line2.bytes);
  check(
    "editing the second line leaves the first alone",
    Math.abs(styleLine2.lines[0].box[2] - styleBefore.lines[0].box[2]) <= 8 &&
      Math.abs(styleLine2.lines[1].box[2] - styleBefore.lines[1].box[2]) > 8,
    `line 1 ${styleBefore.lines[0].box[2]}->${styleLine2.lines[0].box[2]} (must not move), ` +
      `line 2 ${styleBefore.lines[1].box[2]}->${styleLine2.lines[1].box[2]} (must change)`,
  );

  // Naming text that isn't in the selection must be declined, not applied to
  // whichever line happens to be closest.
  let declined = false;
  try {
    await applyTextEdit({ regionBytes: regionBefore, fromText: "SUPERCALIFRAGILISTIC", toText: "NOPE" });
  } catch {
    declined = true;
  }
  check("text that isn't in the selection is declined", declined, "applyTextEdit threw rather than guessing a line");

  console.log("\n── A hand-drawn region, not a detected layer box ──");
  // The marquee path hands `edit.ts` an arbitrary rectangle from a pointer
  // drag — looser, offset, and never aligned to the ink the way a detected
  // bbox is. It shares the pipeline but had never been exercised.
  const MARQUEE: [number, number, number, number] = [700, 1950, 1850, 620];
  const marqueeRegion = await sharp(before)
    .extract({ left: MARQUEE[0], top: MARQUEE[1], width: MARQUEE[2], height: MARQUEE[3] })
    .png()
    .toBuffer();
  let marqueeOk = false;
  let marqueeNote = "";
  try {
    const m = await applyTextEdit({ regionBytes: marqueeRegion, fromText: "STARTING", toText: "CLOSING" });
    const composed = await sharp(before)
      .composite([{ input: m.bytes, left: MARQUEE[0], top: MARQUEE[1] }])
      .png()
      .toBuffer();
    const rep = await measureChange(before, composed, MARQUEE);
    marqueeOk = rep.landed;
    marqueeNote = `${m.font.family.label} ${m.font.weight}, strong=${(rep.strongRatio * 100).toFixed(2)}%`;
  } catch (err) {
    marqueeNote = `threw: ${err instanceof Error ? err.message : err}`;
  }
  check("a marquee-shaped region edits the same as a layer", marqueeOk, marqueeNote);

  console.log("\n── Lowercase text keeps its size ──");
  // A line with no capital and no ascender shows its x-height, not its cap
  // height. Read as a cap height it renders ~21% too small; this is a
  // round-trip through the real path on synthetic lowercase.
  const LC_SIZE = 160;
  const lc = await renderText({
    text: "soon",
    font: { family: findFamily("arimo")!, weight: 700, file: findFamily("arimo")!.weights[700] },
    sizePx: LC_SIZE,
    metric: "xHeight",
    color: { r: 20, g: 30, b: 60 },
  });
  const lcRegion = await sharp({
    create: { width: lc.width + 120, height: lc.height + 120, channels: 3, background: { r: 235, g: 238, b: 245 } },
  })
    .composite([{ input: lc.bytes, left: 60, top: 60 }])
    .png()
    .toBuffer();
  const lcBefore = (await readTextStyle(lcRegion)).lines[0];
  const lcEdited = await applyTextEdit({ regionBytes: lcRegion, fromText: "soon", toText: "worn" });
  const lcAfter = (await readTextStyle(lcEdited.bytes)).lines[0];
  const lcErr = Math.abs(lcAfter.inkHeightPx - lcBefore.inkHeightPx) / lcBefore.inkHeightPx;
  check(
    "an all-lowercase replacement matches the original's height",
    lcErr <= 0.06,
    `${lcBefore.inkHeightPx}px -> ${lcAfter.inkHeightPx}px (${(lcErr * 100).toFixed(1)}% off)`,
  );

  console.log("\n── Dimension contract ──");
  const shrunk = await sharp(before).resize(1024, 1024, { fit: "fill" }).png().toBuffer();
  let threw = false;
  try {
    await measureChange(before, shrunk, null);
  } catch {
    threw = true;
  }
  check("a resolution collapse is refused, not silently saved", threw, "measureChange threw on a size mismatch");

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
