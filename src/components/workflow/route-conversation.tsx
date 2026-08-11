"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, History } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import type { RoutePlan } from "@/lib/workflow/plan";

const ACCENT = SPECTRUM.spacing.color;

type JobStatus = "queued" | "running" | "complete" | "failed";

/** Renders **bold** inline within a line — pure text splitting, no HTML parsing. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} style={{ fontVariationSettings: '"wght" 600' }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/**
 * A follow-up reply is prompted to be plain prose (see turn.ts's
 * TURN_SYSTEM), but a model can't be relied on to always comply — this is a
 * safety net, not the primary fix: it recognizes the handful of markdown
 * constructs a reply realistically leaks (**bold**, "-"/"*" bullets,
 * numbered lists, "#" headers) and renders them as real elements instead of
 * literal asterisks and dashes. Deliberately NOT a full markdown parser —
 * no dangerouslySetInnerHTML, no HTML in the input is ever trusted; this
 * only ever builds React elements from plain text.
 */
function renderReplyText(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>);
    blocks.push(
      listType === "ol" ? (
        <ol key={blocks.length} className="ml-4 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-4 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    listItems = [];
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const bullet = /^[-*]\s+(.*)/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)/.exec(line);
    const header = /^#{1,6}\s+(.*)/.exec(line);

    if (bullet) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }
    if (numbered) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numbered[1]);
      continue;
    }
    flushList();
    const content = header ? header[1] : line;
    blocks.push(
      <p key={blocks.length} style={header ? { fontVariationSettings: '"wght" 600' } : undefined}>
        {renderInline(content, `p-${blocks.length}`)}
      </p>,
    );
  }
  flushList();
  return (
    <div className="text-pretty mt-1 space-y-2 text-[13.5px] leading-relaxed text-foreground/80">{blocks}</div>
  );
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string | null;
  revisedPlan: RoutePlan | null;
  changeSummary: string | null;
  status: JobStatus;
  error: string | null;
  createdAt: Date;
}

const DIFFICULTY_COLOR: Record<RoutePlan["steps"][number]["difficulty"], string> = {
  comfortable: "oklch(0.75 0.16 145)",
  "a stretch": "oklch(0.8 0.16 85)",
  "new to you": "oklch(0.72 0.19 40)",
};

function PlanView({ plan }: { plan: RoutePlan }) {
  return (
    <>
      <p className="text-pretty text-[13.5px] leading-relaxed text-foreground/78">{plan.reading}</p>

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Approaches considered</p>
        <div className="mt-3 space-y-3">
          {plan.approaches.map((a) => (
            <div
              key={a.name}
              className="rounded-lg border px-3.5 py-3"
              style={
                a.name === plan.chosen
                  ? { borderColor: `color-mix(in oklch, ${ACCENT} 40%, transparent)`, background: `color-mix(in oklch, ${ACCENT} 8%, transparent)` }
                  : { borderColor: "oklch(1 0 0 / 0.08)" }
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px]" style={{ fontVariationSettings: '"wght" 550' }}>
                  {a.name}
                </p>
                {a.name === plan.chosen && (
                  <span className="rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em]" style={{ color: ACCENT, background: `color-mix(in oklch, ${ACCENT} 16%, transparent)` }}>
                    Chosen
                  </span>
                )}
                {a.unfamiliar && (
                  <span className="rounded-full border border-white/[0.09] px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em] text-foreground/50">
                    Worth trying
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/62">{a.summary}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/45">{a.whySuits}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">The route</p>
          <span className="font-mono text-[11px] text-foreground/45">{plan.totalHours}h total</span>
        </div>
        <ol className="mt-3 space-y-3">
          {plan.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 font-mono text-[11px] text-foreground/40">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[13px] text-foreground/90">{s.title}</p>
                  <span className="font-mono text-[11px] text-foreground/45">
                    {s.tool} · {s.feature}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground/58">{s.done}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-foreground/40">{s.hours}h</span>
                  <span style={{ color: DIFFICULTY_COLOR[s.difficulty] }}>{s.difficulty}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {plan.gaps.length > 0 && (
        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Gaps</p>
          <ul className="mt-2 space-y-1.5">
            {plan.gaps.map((g, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-foreground/62">
                <span style={{ color: ACCENT }}>—</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.assumptions.length > 0 && (
        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Assumed</p>
          <ul className="mt-2 space-y-1.5">
            {plan.assumptions.map((a, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-foreground/45">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Renders the plan, its revision history, the transcript, and the
 * follow-up box. Reads `initialPlan`/`turns` straight from props on every
 * render rather than seeding useState from them — the exact bug hit and
 * fixed in rebuild-editor.tsx this session: a useState initializer never
 * re-runs, so router.refresh() delivering a new turn after a follow-up
 * would silently never show up. `pinnedRevision` is the one piece of real
 * local state, and it's nullable ("follow the latest") for the same reason
 * rebuild-editor.tsx's pinnedVersionId is.
 */
export function RouteConversation(props: {
  planId: string;
  brief: string;
  deadline: string | null;
  tools: string[];
  skillLevel: string | null;
  planStatus: JobStatus;
  planError: string | null;
  createdAt: Date;
  initialPlan: RoutePlan | null;
  turns: Turn[];
}) {
  const { planId, initialPlan, turns, planStatus, planError } = props;
  const router = useRouter();

  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedRevision, setPinnedRevision] = useState<number | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  useEffect(() => () => sourceRef.current?.close(), []);

  // Every completed assistant turn that revised the plan is its own
  // revision, in order, with revision 0 being the plan as first generated.
  const revisions = [
    { plan: initialPlan, changeSummary: null as string | null, turnId: null as string | null },
    ...turns
      .filter((t) => t.role === "assistant" && t.status === "complete" && t.revisedPlan)
      .map((t) => ({ plan: t.revisedPlan, changeSummary: t.changeSummary, turnId: t.id })),
  ];
  const latestIndex = revisions.length - 1;
  const viewIndex = pinnedRevision !== null && pinnedRevision <= latestIndex ? pinnedRevision : latestIndex;
  const currentPlan = revisions[viewIndex].plan;

  const submit = useCallback(async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { turnId } = await fetchJson<{ turnId: string }>(
        `/api/route/${planId}/turn`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) },
        "Could not send that",
      );

      const source = new EventSource(`/api/route/turn/${turnId}/stream`);
      sourceRef.current = source;

      source.addEventListener("complete", () => {
        source.close();
        sourceRef.current = null;
        setBusy(false);
        setQuestion("");
        // A new revision, if there is one, should be what's shown next —
        // unpin so the freshly-refreshed props' latest revision wins.
        setPinnedRevision(null);
        router.refresh();
      });

      source.addEventListener("failed", (e) => {
        let reason: string | null = null;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data?.error === "string") reason = data.error;
        } catch {
          // no parseable reason — the generic message below still shows
        }
        source.close();
        sourceRef.current = null;
        setBusy(false);
        setError(reason ?? "That didn't go through. Try again.");
      });

      source.addEventListener("timeout", () => {
        source.close();
        sourceRef.current = null;
        setBusy(false);
        setError("That's taking longer than expected. Try again in a moment.");
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [question, busy, planId, router]);

  return (
    <div className="space-y-6">
      <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The brief</h2>
          <span className="font-mono text-[10.5px] text-foreground/45">
            {[props.deadline, props.skillLevel].filter(Boolean).join(" · ") || new Date(props.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className="text-pretty mt-3 text-[13.5px] leading-relaxed text-foreground/75">{props.brief}</p>
        {props.tools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {props.tools.map((t) => (
              <span key={t} className="rounded-full border border-white/[0.09] bg-white/[0.02] px-2 py-0.5 text-[11px] text-foreground/58">
                {t}
              </span>
            ))}
          </div>
        )}
      </PrismPanel>

      {(planStatus === "queued" || planStatus === "running") && (
        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <p className="flex items-center gap-2 text-[13.5px] text-foreground/58">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {planStatus === "queued" ? "Queued — starting shortly." : "Reading this now."}
          </p>
        </PrismPanel>
      )}

      {planStatus === "failed" && (
        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <p className="text-[13.5px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
            {planError ?? "Something went wrong building this plan."}
          </p>
        </PrismPanel>
      )}

      {currentPlan && (
        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">The route</h2>
            {revisions.length > 1 && (
              <div className="flex items-center gap-1.5">
                <History className="size-3 text-foreground/40" aria-hidden />
                <div className="flex gap-1">
                  {revisions.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPinnedRevision(i)}
                      title={r.changeSummary ?? "Original plan"}
                      className="size-5 rounded-full border text-[9.5px] transition-colors"
                      style={
                        i === viewIndex
                          ? { borderColor: ACCENT, color: ACCENT, background: `color-mix(in oklch, ${ACCENT} 16%, transparent)` }
                          : { borderColor: "oklch(1 0 0 / 0.12)", color: "oklch(1 0 0 / 0.45)" }
                      }
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {viewIndex > 0 && revisions[viewIndex].changeSummary && (
            <p className="mt-2 text-[12px] leading-relaxed text-foreground/55">
              Revision {viewIndex}: {revisions[viewIndex].changeSummary}
            </p>
          )}
          <div className="mt-3">
            <PlanView plan={currentPlan} />
          </div>
        </PrismPanel>
      )}

      {turns.length > 0 && (
        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Conversation</h2>
          <div className="mt-4 space-y-4">
            {turns.map((t) => (
              <div key={t.id}>
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-foreground/40">
                  {t.role === "user" ? "You" : "Reply"}
                </p>
                {t.status === "failed" ? (
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
                    {t.error ?? "This didn't go through."}
                  </p>
                ) : t.status !== "complete" ? (
                  <p className="mt-1 flex items-center gap-2 text-[13px] text-foreground/50">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Thinking…
                  </p>
                ) : (
                  <>
                    {renderReplyText(t.content ?? "")}
                    {t.revisedPlan && t.changeSummary && (
                      <p className="mt-1.5 text-[11.5px]" style={{ color: ACCENT }}>
                        Plan updated — {t.changeSummary}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </PrismPanel>
      )}

      {planStatus === "complete" && (
        <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Ask about it</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/50">
            Ask for clarity, or point out something that&apos;s actually wrong — the plan only changes when it should.
          </p>
          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="e.g. Why this approach over the others? or Step 4 needs a tool I don't have."
              className="min-w-0 flex-1 resize-y rounded-xl border border-white/[0.09] bg-black/25 p-3 text-[13px] leading-relaxed text-foreground/90 placeholder:text-foreground/45 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15 disabled:opacity-60"
            />
            <ChromeButton onClick={submit} disabled={busy || !question.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Ask"}
            </ChromeButton>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "oklch(0.72 0.19 18)" }}>
              {error}
            </p>
          )}
        </PrismPanel>
      )}
    </div>
  );
}
