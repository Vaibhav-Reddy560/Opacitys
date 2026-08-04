"use client";

import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChromeButton } from "@/components/ui/chrome-button";
import { PrismPanel } from "@/components/brand/prism";
import { FeatureIllustration } from "@/components/landing/feature-illustrations";
import { MODULES, STATUS_LABEL, type ModuleDef } from "@/lib/copy";
import { SPECTRUM } from "@/lib/critique/spectrum";
import type { Dimension } from "@/lib/critique/types";

/**
 * Replaces the old nine-card grid — one paragraph each, deep-linking straight
 * into `/studio` with no account and no explanation. This is a proper tab
 * explorer: a rail of nine real tabs and one large detail panel that explains
 * what a module actually takes as input, gives back, and does step by step.
 *
 * Every CTA routes through `/signup?next=<module href>` rather than the
 * studio directly — the proxy gate (see `src/proxy.ts`) would bounce an
 * unauthenticated visit anyway, but the point of this page is to explain the
 * feature before asking for an account, not to let a click skip past that.
 */
export function FeatureExplorer() {
  const [active, setActive] = useState<ModuleDef["slug"]>(MODULES[0].slug);
  const reduce = useReducedMotion();
  const router = useRouter();

  const railRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = MODULES.findIndex((m) => m.slug === active);
  const activeModule = MODULES[activeIndex];
  const accent = SPECTRUM[activeModule.dimension as Dimension]?.color;

  function move(refs: RefObject<(HTMLButtonElement | null)[]>, e: KeyboardEvent) {
    let next = activeIndex;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (activeIndex + 1) % MODULES.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      next = (activeIndex - 1 + MODULES.length) % MODULES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = MODULES.length - 1;
    else return;
    e.preventDefault();
    setActive(MODULES[next].slug);
    refs.current[next]?.focus();
  }

  const goToSignup = () => router.push(`/signup?next=${encodeURIComponent(activeModule.href)}`);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-start lg:gap-10">
      {/* Mobile / tablet — horizontally scrollable chip row */}
      <div
        className="-mx-1 overflow-x-auto pb-1 lg:hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, black 6%, black 94%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, black 6%, black 94%, transparent)",
        }}
      >
        <div
          role="tablist"
          aria-label="Studio modules"
          aria-orientation="horizontal"
          onKeyDown={(e) => move(chipRefs, e)}
          className="flex w-max gap-2 px-1"
        >
          {MODULES.map((m, i) => {
            const isActive = m.slug === active;
            const a = SPECTRUM[m.dimension as Dimension]?.color;
            return (
              <button
                key={m.slug}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                role="tab"
                id={`m-tab-${m.slug}`}
                aria-selected={isActive}
                aria-controls={`feature-panel-${m.slug}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(m.slug)}
                data-cursor-accent={a}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] whitespace-nowrap transition-colors",
                  isActive
                    ? "border-white/20 bg-white/[0.06] text-foreground"
                    : "border-white/[0.08] text-foreground/58 hover:text-foreground/85",
                )}
                style={isActive ? { boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${a} 45%, transparent)` } : undefined}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop — vertical rail */}
      <div
        role="tablist"
        aria-label="Studio modules"
        aria-orientation="vertical"
        onKeyDown={(e) => move(railRefs, e)}
        className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-0.5"
      >
        {MODULES.map((m, i) => {
          const isActive = m.slug === active;
          const a = SPECTRUM[m.dimension as Dimension]?.color;
          return (
            <button
              key={m.slug}
              ref={(el) => {
                railRefs.current[i] = el;
              }}
              role="tab"
              id={`d-tab-${m.slug}`}
              aria-selected={isActive}
              aria-controls={`feature-panel-${m.slug}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(m.slug)}
              // Tints the cursor halo to this module's colour — see
              // custom-cursor.tsx. On the whole row, not just the indicator.
              data-cursor-accent={a}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-[13.5px] transition-colors",
                isActive
                  ? "bg-white/[0.05] text-foreground"
                  : "text-foreground/58 hover:bg-white/[0.025] hover:text-foreground/85",
              )}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-y-1.5 left-0 w-[2px] rounded-full"
                  style={{ background: a, boxShadow: `0 0 8px ${a}` }}
                />
              )}
              <span className="flex-1">{m.name}</span>
              {m.status !== "live" && (
                <span className="text-[9px] uppercase tracking-[0.08em] text-foreground/40">
                  {STATUS_LABEL[m.status]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeModule.slug}
          id={`feature-panel-${activeModule.slug}`}
          role="tabpanel"
          aria-labelledby={`d-tab-${activeModule.slug}`}
          tabIndex={0}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <PrismPanel accent={accent} className="overflow-hidden">
            <div className="border-b border-white/[0.06] bg-black/15 p-6 sm:p-8">
              <div className="mx-auto aspect-[16/8] max-w-xl">
                <FeatureIllustration
                  slug={activeModule.slug}
                  accent={accent}
                  reduce={!!reduce}
                />
              </div>
            </div>

            <div className="p-7 sm:p-9">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3
                  className="text-[19px] tracking-tight"
                  style={{ fontVariationSettings: '"wght" 600' }}
                >
                  {activeModule.name}
                </h3>
                <span
                  className="rounded-full border px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em]"
                  style={
                    activeModule.status === "live"
                      ? {
                          color: accent,
                          borderColor: `color-mix(in oklch, ${accent} 32%, transparent)`,
                          background: `color-mix(in oklch, ${accent} 10%, transparent)`,
                        }
                      : { color: "oklch(0.68 0.014 258)", borderColor: "oklch(1 0 0 / 0.1)" }
                  }
                >
                  {STATUS_LABEL[activeModule.status]}
                </span>
              </div>
              <p className="mt-1.5 text-[13.5px]" style={{ color: accent }}>
                {activeModule.tagline}
              </p>
              <p className="mt-3.5 text-[14px] leading-relaxed text-foreground/62">
                {activeModule.body}
              </p>

              <div className="mt-7 grid gap-3.5 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-foreground/50">
                    You bring
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/82">
                    {activeModule.input}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-foreground/50">
                    You get back
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/82">
                    {activeModule.output}
                  </p>
                </div>
              </div>

              <div className="mt-7">
                <p className="mb-4 text-[10px] uppercase tracking-[0.14em] text-foreground/50">
                  How it works
                </p>
                <ol className="relative space-y-5 pl-1">
                  <span
                    aria-hidden
                    className="absolute left-[9.5px] top-2 bottom-2 w-px"
                    style={{
                      background: `linear-gradient(to bottom, transparent, color-mix(in oklch, ${accent} 55%, transparent), transparent)`,
                    }}
                  />
                  {activeModule.steps.map((s, i) => (
                    <li key={i} className="relative flex gap-3.5">
                      <span
                        className="relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]"
                        style={{ background: accent, color: "oklch(0.145 0.012 265)" }}
                      >
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-[13.5px] leading-relaxed text-foreground/72">
                        {s}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-8 flex justify-end border-t border-white/[0.06] pt-6">
                <ChromeButton onClick={goToSignup}>
                  Try {activeModule.name}
                  <ArrowUpRight className="size-4" aria-hidden />
                </ChromeButton>
              </div>
            </div>
          </PrismPanel>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
