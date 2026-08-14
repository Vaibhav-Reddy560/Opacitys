/**
 * Manual, real end-to-end check of the daily digest pipeline — the actual
 * ensureDailyDigest code path, not a hand-rolled equivalent. Calls real
 * Tavily + Groq APIs and writes real rows to daily_digest.
 *
 * Run: node --env-file=.env.local node_modules/.bin/tsx --tsconfig scripts/tsconfig.json scripts/probe-digest.ts
 */
import { ensureDailyDigest } from "../src/lib/digest/pipeline";
import { getTodayStyles, getTodayNews } from "../src/lib/digest/get";

async function run() {
  for (const kind of ["styles", "news"] as const) {
    const started = Date.now();
    await ensureDailyDigest(kind);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n=== ensureDailyDigest(${kind}) — first call, ${elapsed}s ===`);

    const startedAgain = Date.now();
    await ensureDailyDigest(kind);
    const elapsedAgain = ((Date.now() - startedAgain) / 1000).toFixed(1);
    console.log(`=== ensureDailyDigest(${kind}) — second call (should be a fast no-op), ${elapsedAgain}s ===`);
  }

  const styles = await getTodayStyles();
  console.log("\n--- getTodayStyles() ---");
  console.log(JSON.stringify(styles, null, 2));

  const news = await getTodayNews();
  console.log("\n--- getTodayNews() ---");
  console.log(JSON.stringify(news, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
