/**
 * Backfills `assets.facts` for uploads that predate the column.
 *
 * Why this exists: Critique used the findings-only `measureImage` wrapper,
 * which computed MeasuredFacts and discarded them, and Originality dropped
 * them after building its prompt. Only Identify ever persisted them (nested
 * in `analyses.raw.facts`). So most existing uploads have no palette/type
 * data, and Fingerprint would read an almost-empty profile.
 *
 * Costs ZERO AI tokens — `measureImageFull` is deterministic in-process
 * measurement (sharp decode + pure-TS analyzers). The only external calls
 * are the Blob image fetches.
 *
 * Idempotent: only touches rows where `facts IS NULL`, so a partial run
 * resumes cleanly and a re-run is a no-op. Sequential rather than parallel,
 * and per-asset try/caught — one unreadable image costs that asset, not the
 * batch.
 *
 * Run:  npx tsx scripts/backfill-asset-facts.ts
 */
import { readFileSync } from "node:fs";
import Module from "node:module";
import { isNull, eq } from "drizzle-orm";

// `server-only` is a Next-provided guard that only resolves through its
// bundler. src/lib/db and src/lib/measure legitimately import it, so outside
// `next dev` the require chain dies before reaching any real code. Resolve
// it to an empty module for this process only — the guard still applies
// everywhere Next actually enforces it.
const nodeRequire = Module.prototype.require as unknown as (id: string) => unknown;
(Module.prototype as { require: unknown }).require = function (id: string) {
  if (id === "server-only") return {};
  return nodeRequire.call(this, id);
};

// .env.local isn't auto-loaded outside `next dev` — parse it before any
// module that reads process.env at import time (db, blob) is pulled in.
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

async function main() {
  // Imported inside main(), after the env parsing above has run — these
  // modules read process.env at import time, and tsx compiles this file to
  // CJS where top-level await isn't available to order that for us.
  const { db, schema } = await import("../src/lib/db/index");
  const { measureImageFull } = await import("../src/lib/measure/index");

  const pending = await db
    .select({ id: schema.assets.id, storageKey: schema.assets.storageKey })
    .from(schema.assets)
    .where(isNull(schema.assets.facts));

  console.log(`${pending.length} asset(s) with no stored facts.`);
  if (pending.length === 0) return;

  let done = 0;
  let failed = 0;

  for (const [i, asset] of pending.entries()) {
    const label = `[${i + 1}/${pending.length}] ${asset.id}`;
    try {
      const res = await fetch(asset.storageKey);
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      const bytes = Buffer.from(await res.arrayBuffer());

      const { facts } = await measureImageFull(bytes);
      await db.update(schema.assets).set({ facts }).where(eq(schema.assets.id, asset.id));

      done++;
      console.log(
        `${label} ok — ${facts.dominantColors.length} colors, ${facts.textLineCount} text lines`,
      );
    } catch (err) {
      failed++;
      // Skip, don't abort: a 404'd blob or an image sharp can't decode
      // shouldn't cost the other 23 assets their backfill.
      console.error(`${label} SKIPPED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nBackfilled ${done}, skipped ${failed}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
