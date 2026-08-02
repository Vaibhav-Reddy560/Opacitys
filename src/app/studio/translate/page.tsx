"use client";

import { useEffect, useState } from "react";
import { MessagesSquare, Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/studio/page-header";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { InterpretationPanels } from "@/components/studio/interpretation-panels";
import { VoiceMicButton } from "@/components/voice/voice-mic-button";
import { MODULES } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { ClientInterpretation } from "@/lib/ai/client-interpretation";

const MODULE = MODULES.find((m) => m.slug === "translate")!;
const ACCENT = SPECTRUM.originality.color;

const CHANNELS = ["Email", "Slack", "WhatsApp / SMS", "Call notes", "In person", "Other"];

interface Entry {
  id: string;
  rawText: string;
  channel: string | null;
  iterationNumber: number | null;
  respondedAt: string | null;
  turnaroundMinutes: number | null;
  priceCents: number | null;
  createdAt: string;
  interpretation: {
    filtered: { readingOfIt: string; costly: { note: string; why: string }[]; questionsToAsk: string[] } | null;
    actionableSteps: ClientInterpretation["actionable"] | null;
    pushbackScript: string | null;
  } | null;
}

function toInterpretation(entry: Entry): ClientInterpretation | null {
  const i = entry.interpretation;
  if (!i || !i.filtered || !i.actionableSteps || !i.pushbackScript) return null;
  return {
    readingOfIt: i.filtered.readingOfIt,
    actionable: i.actionableSteps,
    costly: i.filtered.costly,
    questionsToAsk: i.filtered.questionsToAsk,
    replyDraft: i.pushbackScript,
  };
}

function formatMoney(cents: number | null): string | null {
  if (cents == null) return null;
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function TranslatePage() {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [iteration, setIteration] = useState(1);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [interpretingId, setInterpretingId] = useState<string | null>(null);

  async function loadEntries() {
    try {
      const res = await fetch("/api/client-messages");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the log.");
      const loaded = json.entries as Entry[];
      setEntries(loaded);
      setListError(null);
      const maxIteration = loaded.reduce((m, e) => Math.max(m, e.iterationNumber ?? 0), 0);
      setIteration(maxIteration + 1);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load the log.");
      setEntries([]);
    }
  }

  useEffect(() => {
    // Fetch-on-mount to populate the log — same pattern as critique/page.tsx's
    // demo-user fetch, just factored into a named function since submit(),
    // interpret() and markReplied() all need to re-run it after a mutation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEntries();
  }, []);

  async function submit() {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const createRes = await fetch("/api/client-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: message,
          channel,
          iterationNumber: iteration,
          priceCents: price ? Math.round(parseFloat(price) * 100) : undefined,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? "Could not log that message.");

      setMessage("");
      setPrice("");
      await loadEntries();

      // Auto-interpret the entry just created. If this fails (e.g. no
      // AI_GATEWAY_API_KEY), the entry is still logged — interpretation
      // stays available on demand from the timeline below.
      const id = createJson.entry.id as string;
      setInterpretingId(id);
      await fetch(`/api/client-messages/${id}/interpret`, { method: "POST" });
      await loadEntries();
      setInterpretingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function interpret(id: string) {
    setInterpretingId(id);
    await fetch(`/api/client-messages/${id}/interpret`, { method: "POST" });
    await loadEntries();
    setInterpretingId(null);
  }

  async function markReplied(id: string) {
    await fetch(`/api/client-messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markResponded: true }),
    });
    await loadEntries();
  }

  return (
    <div className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <PageHeader module={MODULE} icon={<MessagesSquare className="size-4" aria-hidden />} />

        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <label
              htmlFor="client-message"
              className="text-[11px] uppercase tracking-[0.2em] text-foreground/52"
            >
              What the client said
            </label>
            <VoiceMicButton onFinalText={(t) => setMessage((prev) => (prev ? `${prev} ${t}` : t))} />
          </div>
          <textarea
            id="client-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Paste or dictate their message exactly as they sent it — the wording matters."
            className="mt-3 w-full resize-y rounded-xl border border-white/[0.09] bg-black/25 p-3.5 text-[13.5px] leading-relaxed text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="channel" className="block text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                Channel
              </label>
              <select
                id="channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3 py-2.5 text-[13px] text-foreground/90 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="iteration" className="block text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                Iteration
              </label>
              <input
                id="iteration"
                type="number"
                min={1}
                value={iteration}
                onChange={(e) => setIteration(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-2 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3 py-2.5 text-[13px] text-foreground/90 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
              />
            </div>
            <div>
              <label htmlFor="price" className="block text-[11px] uppercase tracking-[0.2em] text-foreground/52">
                Price <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="mt-2 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3 py-2.5 text-[13px] text-foreground/90 placeholder:text-foreground/50 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15"
              />
            </div>
          </div>

          <div className="mt-6">
            <ChromeButton onClick={submit} disabled={busy || !message.trim()}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Logging…
                </>
              ) : (
                <>
                  Log it
                  <Send className="size-4" aria-hidden />
                </>
              )}
            </ChromeButton>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
              {error}
            </p>
          )}
        </PrismPanel>

        <div className="mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The log</h2>

          {listError && <p className="mt-4 text-[13px] leading-relaxed text-foreground/55">{listError}</p>}

          {entries === null && <p className="mt-4 text-[13px] text-foreground/50">Loading…</p>}

          {entries && entries.length === 0 && !listError && (
            <p className="mt-4 text-[13px] leading-relaxed text-foreground/50">
              Nothing logged yet — the first entry you add above will show up here.
            </p>
          )}

          <div className="mt-5 space-y-5">
            {entries?.map((entry) => {
              const interpretation = toInterpretation(entry);
              const priceLabel = formatMoney(entry.priceCents);
              return (
                <PrismPanel key={entry.id} className="p-6 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground/52">
                    <span>{formatWhen(entry.createdAt)}</span>
                    {entry.channel && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{entry.channel}</span>
                      </>
                    )}
                    {entry.iterationNumber != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Iteration {entry.iterationNumber}</span>
                      </>
                    )}
                    {priceLabel && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{priceLabel}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/85">{entry.rawText}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {entry.respondedAt ? (
                      <span className="text-[11.5px] text-foreground/50">
                        Replied in{" "}
                        {entry.turnaroundMinutes != null ? formatDuration(entry.turnaroundMinutes) : "—"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markReplied(entry.id)}
                        className="text-[11.5px] text-foreground/55 underline-offset-4 transition-colors hover:text-foreground/85 hover:underline"
                      >
                        Mark replied
                      </button>
                    )}
                    {!interpretation && (
                      <button
                        type="button"
                        onClick={() => interpret(entry.id)}
                        disabled={interpretingId === entry.id}
                        className="text-[11.5px] text-foreground/55 underline-offset-4 transition-colors hover:text-foreground/85 hover:underline disabled:opacity-50"
                      >
                        {interpretingId === entry.id ? "Reading it back…" : "Interpret this"}
                      </button>
                    )}
                  </div>

                  {interpretation && (
                    <div className="mt-5 border-t border-white/[0.07] pt-5">
                      <InterpretationPanels result={interpretation} />
                    </div>
                  )}
                </PrismPanel>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
