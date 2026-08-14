"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { UploadsPanel } from "./uploads-panel";
import { WorkRow } from "./work-row";
import { PrismPanel } from "@/components/brand/prism";
import { RESULT_HREF, KIND_LABEL, type AnyResultKind } from "@/lib/library/hrefs";
import type { AssetSummary, WorkItem } from "@/lib/library/queries";
import { META_ACCENT } from "@/lib/critique/spectrum";

const IMAGE_KINDS: ReadonlySet<AnyResultKind> = new Set(["critique", "identify", "rebuild", "originality"]);
const WORK_KINDS: ReadonlySet<AnyResultKind> = new Set(["originality", "trends", "tools", "rights", "workflow"]);
// Matches MODULES' own order (src/lib/copy.ts), skipping Correspondence and
// Fingerprint — neither has individually-browsable past runs of its own.
const FILTER_ORDER: AnyResultKind[] = ["critique", "rebuild", "identify", "trends", "workflow", "tools", "originality", "rights"];

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Owns the "filter by feature" dropdown that replaced every module page's
 * own "Recent" strip (recent-strip.tsx, removed) — past work now lives in
 * one browsable place instead of being split across each feature. Both
 * `assets` and `work` are already fully loaded server-side (LibraryPage
 * fetches up to 60 / 40 respectively, unconditionally), so filtering is
 * instant and entirely client-side — no refetch on each selection.
 *
 * Originality is the one kind in both IMAGE_KINDS and WORK_KINDS: it can
 * run with or without an attached sketch, so filtering to it shows both
 * the matching asset cards and the matching Reads rows.
 */
export function LibraryContent({ assets, work }: { assets: AssetSummary[]; work: WorkItem[] }) {
  const [filter, setFilter] = useState<AnyResultKind | "all">("all");

  const showUploads = filter === "all" || IMAGE_KINDS.has(filter);
  const showReads = filter === "all" || WORK_KINDS.has(filter);

  const filteredAssets = filter === "all" ? assets : assets.filter((a) => a.ranKinds.some((k) => k === filter));
  const filteredWork = filter === "all" ? work : work.filter((w) => w.kind === filter);

  return (
    <div>
      <div className="mb-5 flex items-center justify-end gap-2.5">
        <label htmlFor="library-filter" className="text-[11.5px] text-foreground/52">
          Feature
        </label>
        <div className="relative">
          <select
            id="library-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as AnyResultKind | "all")}
            style={{ fontVariationSettings: '"wght" 550' }}
            className="appearance-none rounded-full border border-white/[0.16] bg-white/[0.05] py-2 pl-4 pr-10 text-[12.5px] text-foreground/92 transition-colors hover:border-white/30 hover:bg-white/[0.07] focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
          >
            <option value="all">All features</option>
            {FILTER_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/55"
            aria-hidden
          />
        </div>
      </div>

      {showUploads && (
        <PrismPanel accent={META_ACCENT} className="p-6 sm:p-7">
          <UploadsPanel assets={filteredAssets} />
        </PrismPanel>
      )}

      {showReads && (
        <div className={showUploads ? "mt-6" : ""}>
          <PrismPanel accent={META_ACCENT} className="p-6 sm:p-7">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Reads ({filteredWork.length})</h2>

            {filteredWork.length === 0 ? (
              <p className="mt-4 text-[13px] text-foreground/55">
                {filter === "all"
                  ? "Nothing yet — Currents, Instruments, Clearance and Originality reads will show up here."
                  : `No ${KIND_LABEL[filter]} reads yet.`}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {filteredWork.map((item) => (
                  <WorkRow
                    key={`${item.kind}-${item.id}`}
                    href={RESULT_HREF[item.kind](item.id)}
                    badge={KIND_LABEL[item.kind]}
                    title={item.title}
                    date={formatDate(item.createdAt)}
                    deleteUrl={`/api/library/work/${item.kind}/${item.id}`}
                    deleteConfirm="Delete this read? This can't be undone."
                  />
                ))}
              </ul>
            )}
          </PrismPanel>
        </div>
      )}
    </div>
  );
}
