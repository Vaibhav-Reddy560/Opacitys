"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { ClientInterpretation } from "@/lib/ai/client-interpretation";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: SPECTRUM.layout.color,
  medium: SPECTRUM.spacing.color,
  low: SPECTRUM.balance.color,
};

/**
 * The "what does this client message actually mean" result panels — shared
 * between a just-submitted Correspondence entry and any historical entry in
 * the timeline, so both render identically off the same stored shape.
 */
export function InterpretationPanels({ result }: { result: ClientInterpretation }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <PrismPanel className="p-6 sm:p-7">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
          What they are reacting to
        </h2>
        <p className="text-pretty mt-3 text-[14px] leading-relaxed text-foreground/85">
          {result.readingOfIt}
        </p>
      </PrismPanel>

      {result.actionable.length > 0 && (
        <PrismPanel accent={SPECTRUM.layout.color} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
            Worth doing
          </h2>
          <ul className="mt-5 space-y-5">
            {result.actionable.map((a, i) => (
              <li key={i} className="border-l-2 pl-4" style={{ borderColor: CONFIDENCE_COLOR[a.confidence] }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] italic text-foreground/62">“{a.note}”</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em]"
                    style={{
                      color: CONFIDENCE_COLOR[a.confidence],
                      background: `color-mix(in oklch, ${CONFIDENCE_COLOR[a.confidence]} 12%, transparent)`,
                    }}
                  >
                    {a.confidence}
                  </span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/72">
                  {a.likelyMeans}
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/90">
                  <span className="text-foreground/55">Move — </span>
                  {a.move}
                </p>
              </li>
            ))}
          </ul>
        </PrismPanel>
      )}

      {result.costly.length > 0 && (
        <PrismPanel accent={SPECTRUM.balance.color} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
            Worth talking through first
          </h2>
          <ul className="mt-5 space-y-4">
            {result.costly.map((c, i) => (
              <li key={i}>
                <p className="text-[12.5px] italic text-foreground/62">“{c.note}”</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/80">{c.why}</p>
              </li>
            ))}
          </ul>
        </PrismPanel>
      )}

      {result.questionsToAsk.length > 0 && (
        <PrismPanel accent={SPECTRUM.typography.color} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
            Ask before you start
          </h2>
          <ul className="mt-4 space-y-2.5">
            {result.questionsToAsk.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-foreground/80">
                <span style={{ color: SPECTRUM.typography.color }}>—</span>
                {q}
              </li>
            ))}
          </ul>
        </PrismPanel>
      )}

      <PrismPanel className="p-6 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
            A reply you could send
          </h2>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(result.replyDraft);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] text-foreground/62 transition-colors hover:text-foreground/90"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-pretty mt-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/85">
          {result.replyDraft}
        </p>
      </PrismPanel>
    </div>
  );
}
