// MapLibre resolves its Web Worker's URL from its own `import.meta.url`,
// requiring an http(s) URL to do so. Under Turbopack that isn't one, so the
// derived URL comes back empty and `new Worker("")` spawns a worker that
// never fetches a tile and never errors — the map renders its background
// layer and nothing else. See the comment above `setWorkerUrl(...)` in
// src/components/library/asset-map.tsx for the full story.
//
// The fix is to serve the worker (and the shared chunk it imports) from a
// real URL — /public — instead. Copying rather than committing the files
// keeps them locked to whatever maplibre-gl version is actually installed;
// run automatically via predev/prebuild so they can never silently drift
// from the library the app is importing.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "node_modules/maplibre-gl/dist");
const dest = path.join(root, "public/maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!existsSync(src)) {
  console.warn("[copy-maplibre-worker] maplibre-gl not installed yet, skipping.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of files) {
  copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log(`[copy-maplibre-worker] copied ${files.join(", ")} -> public/maplibre/`);
