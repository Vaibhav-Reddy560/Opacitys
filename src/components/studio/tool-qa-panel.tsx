"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";

interface Result {
  answer: string;
  caveats: string[];
}

export function ToolQaPanel() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const json = await fetchJson<Result>(
        "/api/tools/qa",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) },
        "Could not answer that.",
      );
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PrismPanel accent={SPECTRUM.balance.color} className="p-6 sm:p-7">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">
        Ask about a tool
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/55">
        Mainstream or emerging — including the ones that haven&rsquo;t gone mainstream yet.
      </p>

      <div className="mt-4 flex justify-end">
        <VoiceMicButton onFinalText={(t) => setQuestion((prev) => (prev ? `${prev} ${t}` : t))} />
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        placeholder="e.g. What is Kittl good for, and how is it different from Canva?"
        className="mt-2 w-full resize-y rounded-xl border border-white/[0.09] bg-black/25 p-3.5 text-[13.5px] leading-relaxed text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
      />

      <div className="mt-4">
        <ChromeButton onClick={run} disabled={busy || !question.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Looking that up…
            </>
          ) : (
            "Ask"
          )}
        </ChromeButton>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 border-t border-white/[0.07] pt-6">
          <p className="text-pretty text-[14px] leading-relaxed text-foreground/85">{result.answer}</p>
          {result.caveats.length > 0 && (
            <ul className="mt-4 space-y-2">
              {result.caveats.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-foreground/55">
                  <span style={{ color: SPECTRUM.balance.color }}>—</span>
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PrismPanel>
  );
}
