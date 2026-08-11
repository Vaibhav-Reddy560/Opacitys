"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LayoutGrid, MapIcon } from "lucide-react";
import { DeleteButton } from "@/components/library/delete-button";
import { KIND_LABEL } from "@/lib/library/hrefs";
import { cn } from "@/lib/utils";
import type { AssetSummary } from "@/lib/library/queries";

// The map library is ~230KB and touches `window`/WebGL on load — kept out
// of the initial "Your work" bundle entirely, loaded only once someone
// actually picks the Map tab. `ssr: false` because MapLibre requires a real
// browser environment.
const AssetMap = dynamic(() => import("@/components/library/asset-map").then((m) => m.AssetMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-[420px] place-items-center rounded-xl border border-white/[0.09] bg-white/[0.02]">
      <p className="text-[13px] text-foreground/45">Loading map…</p>
    </div>
  ),
});

type View = "grid" | "map";

/**
 * Grid/Map toggle for the library's "Uploads" panel. Takes the already
 * server-fetched assets as a prop and reads them fresh every render — no
 * useState seeded from props, the exact bug already hit in
 * rebuild-editor.tsx and route-conversation.tsx. `view` is the only real
 * local state here.
 */
export function UploadsPanel({ assets }: { assets: AssetSummary[] }) {
  const [view, setView] = useState<View>("grid");
  const locatedCount = assets.filter((a) => a.latitude !== null).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          Uploads ({assets.length})
        </h2>

        <div className="flex items-center gap-3">
          {assets.length > 0 && (
            <p className="text-[11px] text-foreground/40">
              {locatedCount} of {assets.length} have a location
            </p>
          )}
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.02] p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] transition-colors",
                view === "grid" ? "bg-white/[0.08] text-foreground" : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              <LayoutGrid className="size-3" aria-hidden />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              aria-pressed={view === "map"}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] transition-colors",
                view === "map" ? "bg-white/[0.08] text-foreground" : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              <MapIcon className="size-3" aria-hidden />
              Map
            </button>
          </div>
        </div>
      </div>

      {assets.length === 0 ? (
        <p className="mt-4 text-[13px] text-foreground/55">
          Nothing uploaded yet — Critique, Identify or Originality will start your library.
        </p>
      ) : view === "grid" ? (
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {assets.map((a) => (
            <Link
              key={a.id}
              href={`/studio/library/${a.id}`}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.09] transition-colors hover:border-white/25"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external Blob URL thumbnail, not an optimizable local asset */}
              <img src={a.storageKey} alt="" className="size-full object-cover" />

              {a.ranKinds.length > 0 && (
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1 bg-gradient-to-t from-black/75 to-transparent p-2 pt-5">
                  {a.ranKinds.map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.06em] text-foreground/85 backdrop-blur-sm"
                    >
                      {KIND_LABEL[k]}
                    </span>
                  ))}
                </div>
              )}

              <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <DeleteButton
                  url={`/api/library/assets/${a.id}`}
                  confirmMessage="Delete this image and every result run on it? This can't be undone."
                />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <AssetMap assets={assets} />
        </div>
      )}
    </div>
  );
}
