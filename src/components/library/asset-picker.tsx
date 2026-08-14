"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImagesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssetSummary } from "@/lib/library/queries";

/**
 * "Or pick one you've already uploaded" — sits under a feature's Dropzone.
 * Selecting a thumbnail hands the asset straight to the caller, which calls
 * its existing route with that assetId; no re-upload, since /api/analyze,
 * /api/identify and /api/originality already accept an existing assetId.
 *
 * Fetches lazily and only once — this is a strip under a form that most
 * visits never touch, not something worth loading on every page paint.
 */
export function AssetPicker({
  onSelect,
  disabled,
}: {
  onSelect: (asset: Pick<AssetSummary, "id" | "storageKey" | "originalName">) => void;
  disabled?: boolean;
}) {
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || assets !== null) return;
    fetch("/api/library/assets")
      .then((res) => (res.ok ? res.json() : { assets: [] }))
      .then((data) => setAssets(data.assets ?? []))
      .catch(() => setAssets([]));
  }, [open, assets]);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-foreground/55 transition-colors hover:text-foreground/85 disabled:pointer-events-none disabled:opacity-50"
      >
        <ImagesIcon className="size-3.5" aria-hidden />
        Or pick one you&rsquo;ve already uploaded
      </button>
    );
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-foreground/45">Your uploads</p>
      {assets === null ? (
        <p className="text-[12.5px] text-foreground/50">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-[12.5px] text-foreground/50">Nothing uploaded yet — drop a file above.</p>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(a)}
              title={a.originalName ?? undefined}
              className={cn(
                "group relative size-16 shrink-0 overflow-hidden rounded-lg border border-white/[0.09] transition-colors",
                "hover:border-white/25 disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {/* 64px slot — fixed, so a literal `sizes` is exact. */}
              <Image
                src={a.storageKey}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
