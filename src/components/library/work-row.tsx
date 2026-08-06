"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import { DeleteButton } from "@/components/library/delete-button";

// Below this, a title never needs a toggle — it already fits on one line at
// this column width. Above it, truncate would silently hide real content
// (an Originality description, a Currents scope, an Instruments question),
// which is exactly what "Read more" fixes.
const EXPAND_THRESHOLD = 70;

export function WorkRow({
  href,
  badge,
  title,
  date,
  deleteUrl,
  deleteConfirm,
}: {
  href: string;
  badge: string;
  title: string;
  date: string;
  deleteUrl: string;
  deleteConfirm: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = title.length > EXPAND_THRESHOLD;

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em] text-foreground/50">
            {badge}
          </span>
          {expanded ? (
            <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground/85">{title}</span>
          ) : (
            <span className="block min-w-0 flex-1 truncate text-[13px] text-foreground/75">{title}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[10.5px] text-foreground/40">{date}</span>
          <DeleteButton url={deleteUrl} confirmMessage={deleteConfirm} />
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-4 pl-2">
        {needsToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11.5px] text-foreground/48 transition-colors hover:text-foreground/80"
          >
            <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-[11.5px] text-foreground/48 transition-colors hover:text-foreground/80"
        >
          Open result
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
    </li>
  );
}
