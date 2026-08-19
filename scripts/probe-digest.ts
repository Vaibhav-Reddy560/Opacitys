/**
 * Manual, real end-to-end check of the daily digest pipeline — the actual
 * ensureDailyDigests code path, not a hand-rolled equivalent. Calls real
 * Tavily + Groq APIs and writes real rows to daily_digest.
 *
 * Run: node --env-file=.env.local node_modules/.bin/tsx --tsconfig scripts/tsconfig.json scripts/probe-digest.ts
 */
import { ensureDailyDigests } from "../src/lib/digest/pipeline";
import { getTodayStyles, getTodayNews } from "../src/lib/digest/get";

async function run() {
  const started = Date.now();
  await ensureDailyDigests();
  console.log(`\n=== ensureDailyDigests() — first call, ${((Date.now() - started) / 1000).toFixed(1)}s ===`);

  // Both rows should now be "complete", so this must be a fast no-op rather
  // than a second round of Tavily/Groq spend.
  const again = Date.now();
  await ensureDailyDigests();
  console.log(`=== ensureDailyDigests() — second call (expect a fast no-op), ${((Date.now() - again) / 1000).toFixed(1)}s ===`);

  const styles = await getTodayStyles();
  console.log("\n--- getTodayStyles() ---");
  console.log(`isFresh=${styles?.isFresh} items=${styles?.items.length}`);
  for (const s of styles?.items ?? []) console.log(`  • ${s.name}`);

  const news = await getTodayNews();
  console.log("\n--- getTodayNews() ---");
  console.log(`isFresh=${news?.isFresh} items=${news?.items.length}`);
  for (const n of news?.items ?? []) console.log(`  • ${n.title} (${n.source})`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
