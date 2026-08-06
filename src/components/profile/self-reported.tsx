"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { PrismPanel } from "@/components/brand/prism";
import { ChromeButton } from "@/components/ui/chrome-button";
import { SPECTRUM } from "@/lib/critique/spectrum";
import { fetchJson } from "@/lib/http";
import { SKILL_LEVELS, type PortfolioLink, type StoredProfile } from "@/lib/profile/stored-types";

const ACCENT = SPECTRUM.rhythm.color;

const SKILL_LABEL: Record<(typeof SKILL_LEVELS)[number], string> = {
  learning: "Learning",
  working: "Working designer",
  senior: "Senior",
  lead: "Lead / director",
};

const COMMON_TOOLS = [
  "Figma", "Photoshop", "Illustrator", "InDesign", "After Effects",
  "Blender", "Canva", "Affinity Designer", "Framer", "Webflow", "Procreate", "Rive",
];

const field =
  "w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-[13px] text-foreground/90 placeholder:text-foreground/45 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/15";

/**
 * The half of Fingerprint that can't be measured. Kept visibly separate from
 * everything derived, and labelled as self-reported — a critique score says
 * nothing about which apps someone owns, so inferring this would be exactly
 * the invented precision the rest of the module avoids.
 */
export function SelfReported({ initial }: { initial: StoredProfile }) {
  const router = useRouter();
  const [skillLevel, setSkillLevel] = useState(initial.skillLevel);
  const [tools, setTools] = useState<string[]>(initial.tools);
  const [links, setLinks] = useState<PortfolioLink[]>(initial.portfolioLinks);
  const [customTool, setCustomTool] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleTool(t: string) {
    setSaved(false);
    setTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function addCustomTool() {
    const t = customTool.trim();
    if (!t || tools.includes(t)) return;
    setTools((prev) => [...prev, t]);
    setCustomTool("");
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Drop half-filled link rows rather than failing the whole save on
      // them — the URL field is validated server-side too.
      const cleanLinks = links.filter((l) => l.label.trim() && l.url.trim());
      await fetchJson(
        "/api/profile",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillLevel, tools, portfolioLinks: cleanLinks }),
        },
        "Could not save those details.",
      );
      setLinks(cleanLinks);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save those details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PrismPanel accent={ACCENT} className="p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-foreground/52">Skills &amp; tools</h2>
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-foreground/40">Self-reported</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/55">
        The only part of this page you fill in yourself — nothing here is guessed from your uploads.
      </p>

      <div className="mt-5">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Where you are</h3>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {SKILL_LEVELS.map((s) => {
            const active = skillLevel === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSkillLevel(active ? null : s);
                  setSaved(false);
                }}
                className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                style={
                  active
                    ? {
                        color: ACCENT,
                        borderColor: `color-mix(in oklch, ${ACCENT} 45%, transparent)`,
                        background: `color-mix(in oklch, ${ACCENT} 14%, transparent)`,
                      }
                    : { color: "oklch(1 0 0 / 0.62)", borderColor: "oklch(1 0 0 / 0.09)" }
                }
              >
                {SKILL_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Tools you work in</h3>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {[...new Set([...COMMON_TOOLS, ...tools])].map((t) => {
            const active = tools.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTool(t)}
                className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                style={
                  active
                    ? {
                        color: ACCENT,
                        borderColor: `color-mix(in oklch, ${ACCENT} 45%, transparent)`,
                        background: `color-mix(in oklch, ${ACCENT} 14%, transparent)`,
                      }
                    : { color: "oklch(1 0 0 / 0.62)", borderColor: "oklch(1 0 0 / 0.09)" }
                }
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={customTool}
            onChange={(e) => setCustomTool(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTool();
              }
            }}
            placeholder="Something else you use"
            className={field}
          />
          <button
            type="button"
            onClick={addCustomTool}
            disabled={!customTool.trim()}
            className="shrink-0 rounded-xl border border-white/[0.09] px-3 text-foreground/62 transition-colors hover:text-foreground/90 disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Where your work lives</h3>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-foreground/45">
          Behance closed its public API, so a link is as far as anything can go there. Dribbble can connect for
          real — see the Portfolio panel below.
        </p>
        <div className="mt-3 space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={l.label}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], label: e.target.value };
                  setLinks(next);
                  setSaved(false);
                }}
                placeholder="Behance"
                className={`${field} max-w-[130px] shrink-0`}
              />
              <input
                value={l.url}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], url: e.target.value };
                  setLinks(next);
                  setSaved(false);
                }}
                placeholder="https://…"
                className={field}
              />
              <button
                type="button"
                onClick={() => {
                  setLinks(links.filter((_, x) => x !== i));
                  setSaved(false);
                }}
                className="shrink-0 rounded-xl border border-white/[0.09] px-3 text-foreground/45 transition-colors hover:text-[oklch(0.72_0.19_18)]"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {links.length < 10 && (
            <button
              type="button"
              onClick={() => setLinks([...links, { label: "", url: "" }])}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground/55 transition-colors hover:text-foreground/85"
            >
              <Plus className="size-3.5" aria-hidden />
              Add a link
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <ChromeButton onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </ChromeButton>
        {saved && <span className="text-[12.5px] text-foreground/50">Saved.</span>}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px]" style={{ color: "oklch(0.72 0.19 18)" }}>
          {error}
        </p>
      )}
    </PrismPanel>
  );
}
