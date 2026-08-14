/**
 * Manual, real end-to-end check of the Cloudflare edit path against the
 * reference poster — the actual attemptCloudflareEdit code path in edit.ts,
 * not a hand-rolled equivalent. Calls the real API, costs real Neurons.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/probe-cloudflare.ts
 */
import sharp from "sharp";
import { attemptCloudflareEdit } from "../src/lib/rebuild/edit";
import { measureChange } from "../src/lib/rebuild/verify";

const OUT = "/private/tmp/claude-501/-Users-vaibhavreddy-Random-App/312c94d7-588c-4994-962f-2024a57ce2ed/scratchpad";
const BEFORE =
  "https://55pny0zfjaduirus.public.blob.vercel-storage.com/rebuild-versions/1530b97f-bf52-418a-b1de-a42b0246d2f3/a58f88fe-2701-4afb-949f-5ea03ce35f15.png";
const BADGE: [number, number, number, number] = [2511, 154, 454, 312];
const PROMPT = "a plain navy blue circular badge, no text, flat color";

async function run(engine: "klein" | "sd15") {
  const poster = Buffer.from(await (await fetch(BEFORE)).arrayBuffer());
  const meta = await sharp(poster).metadata();

  const started = Date.now();
  const edited = await attemptCloudflareEdit({
    parentBytes: poster,
    prompt: PROMPT,
    region: BADGE,
    frameW: meta.width!,
    frameH: meta.height!,
    engine,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const editedMeta = await sharp(edited).metadata();
  const dimOk = editedMeta.width === meta.width && editedMeta.height === meta.height;
  const report = await measureChange(poster, edited, BADGE);

  console.log(`\n=== ${engine} (${elapsed}s) ===`);
  console.log(`  dimensions: ${editedMeta.width}x${editedMeta.height} (source ${meta.width}x${meta.height}) ${dimOk ? "OK" : "MISMATCH"}`);
  console.log(`  landed=${report.landed} strong=${(report.strongRatio * 100).toFixed(2)}% bleed=${(report.bleedRatio * 100).toFixed(4)}%`);

  const pad = 60;
  await sharp(edited)
    .extract({ left: BADGE[0] - pad, top: BADGE[1] - pad, width: BADGE[2] + pad * 2, height: BADGE[3] + pad * 2 })
    .png()
    .toFile(`${OUT}/cf_${engine}_after.png`);
  console.log(`  wrote ${OUT}/cf_${engine}_after.png`);

  return dimOk && report.landed;
}

async function main() {
  const engine = (process.argv[2] as "klein" | "sd15") ?? "klein";
  const ok = await run(engine);
  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
