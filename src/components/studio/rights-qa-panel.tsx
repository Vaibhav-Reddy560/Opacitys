"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { SPECTRUM } from "@/lib/critique/spectrum";

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "European Union",
  "Canada",
  "Australia",
  "India",
  "Brazil",
  "Japan",
  "Other / not sure",
] as const;

const DISCLAIMER =
  "General information, not legal advice. Laws vary by jurisdiction and change — confirm specifics with local counsel before relying on this commercially.";

interface Result {
  answer: string;
  keyConsiderations: string[];
  confidence: "general" | "country-specific-approximate";
}

export function RightsQaPanel() {
  const [country, setCountry] = useState<string>(COUNTRIES[0]);
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
      const res = await fetch("/api/rights/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, country }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not put that together.");
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
        Ask about a specific asset
      </h2>

      <p className="text-pretty mt-3 text-[12.5px] leading-relaxed text-foreground/58">
        {DISCLAIMER}
      </p>

      <label htmlFor="rights-country" className="mt-5 block text-[11px] uppercase tracking-[0.2em] text-foreground/52">
        Country you&rsquo;re working from
      </label>
      <select
        id="rights-country"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="mt-3 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-[13.5px] text-foreground/90 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
      >
        {COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label htmlFor="rights-question" className="mt-5 block text-[11px] uppercase tracking-[0.2em] text-foreground/52">
        Your question
      </label>
      <textarea
        id="rights-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={4}
        placeholder="e.g. Can I use a font I downloaded free from a font site in a logo I'll sell merchandise with?"
        className="mt-3 w-full resize-y rounded-xl border border-white/[0.09] bg-black/25 p-3.5 text-[13.5px] leading-relaxed text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
      />

      <div className="mt-6">
        <ChromeButton onClick={run} disabled={busy || !question.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Thinking…
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

          {result.keyConsiderations.length > 0 && (
            <ul className="mt-4 space-y-2">
              {result.keyConsiderations.map((k, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/70">
                  <span style={{ color: SPECTRUM.balance.color }}>—</span>
                  {k}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-[11.5px] leading-relaxed text-foreground/50">{DISCLAIMER}</p>
        </div>
      )}
    </PrismPanel>
  );
}
