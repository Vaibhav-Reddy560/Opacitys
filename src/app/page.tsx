"use client";

import Link from "next/link";
import { TitleImage } from "@/components/brand/title-image";
import { Reveal } from "@/components/motion/reveal";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { Parallax } from "@/components/motion/parallax";
import { SpectrumRule } from "@/components/brand/spectrum-rule";
import { LandingCta } from "@/components/landing/landing-cta";
import { FeatureExplorer } from "@/components/landing/feature-explorer";
import { StickyFrictions } from "@/components/landing/sticky-frictions";
import { SiteNav } from "@/components/landing/site-nav";
import { ScrollProgress } from "@/components/landing/scroll-progress";
import { PrismaticAurora } from "@/components/visual/prismatic-aurora";
import { DimensionMarquee } from "@/components/landing/dimension-marquee";
import { OpacityReveal } from "@/components/landing/opacity-reveal";
import { SpectrumSplit } from "@/components/landing/spectrum-split";
import { HERO, OPACITY_STAGES, CLOSE } from "@/lib/copy";

export default function Home() {
  return (
    <>
      <SiteNav />
      <ScrollProgress />

      <main className="relative">
        {/* ------------------------------------------------------------- */}
        {/* Hero                                                          */}
        {/* ------------------------------------------------------------- */}
        <section
          className="relative isolate flex flex-col items-center justify-center overflow-hidden px-6"
          style={{ minHeight: "min(100svh, 840px)" }}
        >
          <PrismaticAurora className="absolute inset-0 -z-20 h-full w-full" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background: [
                "radial-gradient(105% 62% at 50% 48%, oklch(0.145 0.012 265 / 0.72) 0%, oklch(0.145 0.012 265 / 0.4) 52%, transparent 82%)",
                "linear-gradient(to bottom, oklch(0.145 0.012 265 / 0.35) 0%, oklch(0.145 0.012 265 / 0.1) 30%, oklch(0.145 0.012 265 / 0.1) 70%, oklch(0.145 0.012 265 / 0.55) 100%)",
              ].join(", "),
            }}
          />

          <div className="relative flex w-full max-w-5xl flex-col items-center text-center">
            <Reveal delay={0.05}>
              <TitleImage
                width={1200}
                height={179}
                className="w-full max-w-[290px] sm:max-w-md md:max-w-2xl lg:max-w-3xl h-auto"
                size="hero"
                priority
              />
            </Reveal>

            <Reveal delay={0.2}>
              <div className="mt-7 inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 backdrop-blur-md">
                <span
                  className="whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-foreground/65 sm:text-[11px] sm:tracking-[0.2em]"
                  aria-label={HERO.eyebrow}
                >
                  <span aria-hidden>
                    Everything between{" "}
                    <span
                      className="text-foreground"
                      style={{ fontVariationSettings: '"wght" 650' }}
                    >
                      Vision
                    </span>{" "}
                    and{" "}
                    <span
                      className="text-foreground"
                      style={{ fontVariationSettings: '"wght" 650' }}
                    >
                      Design
                    </span>
                  </span>
                </span>
              </div>
            </Reveal>

            <Reveal delay={0.3} className="mt-5 w-full max-w-xl">
              <SpectrumRule />
            </Reveal>

            <Reveal delay={0.38}>
              <p
                className="text-balance mt-7 max-w-xl text-[14px] leading-relaxed text-foreground/68 sm:text-[15px]"
                aria-label={HERO.lede}
              >
                <span aria-hidden>
                  <span
                    className="text-foreground/92"
                    style={{ fontVariationSettings: '"wght" 560' }}
                  >
                    Opacitys
                  </span>{" "}
                  is a creative workspace that simplifies every stage of the graphic design
                  process, from inspiration to execution. Everything you need to turn ideas
                  into exceptional designs — all in one place.
                </span>
              </p>
            </Reveal>

            <Reveal delay={0.46}>
              <div className="mt-9">
                <LandingCta />
              </div>
            </Reveal>
          </div>

          {/* Hidden below ~760px of real viewport height: on a shorter window
              (13" laptop, extra browser toolbars) there isn't clearance
              between the CTA row and the viewport edge, and this collided
              with the second button — confirmed by measuring both rects,
              not just eyeballing a screenshot. It's a hint, not content, so
              hiding it is the right trade rather than cramming the hero. */}
          <Reveal delay={0.6}>
            <div className="absolute bottom-9 left-1/2 hidden -translate-x-1/2 [@media(min-height:760px)]:block">
              <div className="flex flex-col items-center gap-2.5">
                <span className="text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                  Scroll
                </span>
                <span
                  aria-hidden
                  className="h-9 w-px"
                  style={{
                    background: "linear-gradient(to bottom, oklch(1 0 0 / 0.32), transparent)",
                  }}
                />
              </div>
            </div>
          </Reveal>
        </section>

        {/* Belt — a continuous reminder of the ten-dimension vocabulary */}
        <div className="border-y border-white/[0.06] bg-white/[0.012] py-4">
          <DimensionMarquee />
        </div>

        {/* ------------------------------------------------------------- */}
        {/* What the name means — the metaphor, made draggable             */}
        {/* ------------------------------------------------------------- */}
        <section
          id="how"
          className="relative scroll-mt-20 overflow-hidden border-b border-white/[0.06] px-6 py-28 sm:py-36"
        >
          <Parallax depth={0.22} className="pointer-events-none absolute -right-24 top-10 -z-10 size-[420px] rounded-full opacity-30 blur-[110px]" >
            <div className="size-full rounded-full" style={{ background: "oklch(0.62 0.2 265)" }} />
          </Parallax>

          <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1fr_1fr]">
            <div>
              <Reveal>
                <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">
                  What the name means
                </p>
              </Reveal>
              <ScrollReveal
                as="h2"
                className="text-balance mt-5 block text-3xl leading-[1.14] tracking-tight sm:text-[2.6rem]"
              >
                <span style={{ fontVariationSettings: '"wght" 500' }}>
                  Design is a slow rise from faint to fully there.
                </span>
              </ScrollReveal>
              <Reveal delay={0.1}>
                <p className="text-balance mt-4 max-w-md text-[15px] leading-relaxed text-foreground/62">
                  Opacity is how visible something is. The work of designing is
                  raising it — from a shape you can only half picture, to something
                  every part of which you could defend out loud. Drag the handle.
                </p>
              </Reveal>

              <Reveal delay={0.2}>
                <ul className="mt-9 space-y-4">
                  {OPACITY_STAGES.map((s) => (
                    <li key={s.value} className="flex items-baseline gap-4">
                      <span className="w-10 shrink-0 font-mono text-[12px] text-foreground/52">
                        {s.value}%
                      </span>
                      <div>
                        <p
                          className="text-[13.5px]"
                          style={{ fontVariationSettings: '"wght" 550' }}
                        >
                          {s.label}
                        </p>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground/52">
                          {s.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal delay={0.15}>
              <OpacityReveal />
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* The frictions — pinned heading, scrolling problems             */}
        {/* ------------------------------------------------------------- */}
        <section className="relative border-b border-white/[0.06] px-6 py-28 sm:py-36">
          <div className="mx-auto max-w-6xl">
            <StickyFrictions />
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* The spectrum, explained                                       */}
        {/* ------------------------------------------------------------- */}
        <section className="relative overflow-hidden border-b border-white/[0.06] px-6 py-28 sm:py-36">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">
                The spectrum
              </p>
              <ScrollReveal
                as="h2"
                className="text-balance mt-5 block max-w-2xl text-3xl leading-[1.14] tracking-tight sm:text-[2.6rem]"
              >
                <span style={{ fontVariationSettings: '"wght" 500' }}>
                  One reading, split into ten.
                </span>
              </ScrollReveal>
              <p className="text-balance mt-4 max-w-xl text-[15px] leading-relaxed text-foreground/62">
                Scroll — the same way a prism does it.
              </p>
            </Reveal>

            <div className="mt-16">
              <SpectrumSplit />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* The ten features                                               */}
        {/* ------------------------------------------------------------- */}
        <section
          id="studio"
          className="relative scroll-mt-20 border-b border-white/[0.06] px-6 py-28 sm:py-36"
        >
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/52">
                The studio
              </p>
              <ScrollReveal
                as="h2"
                className="text-balance mt-5 block max-w-2xl text-3xl leading-[1.14] tracking-tight sm:text-[2.6rem]"
              >
                <span style={{ fontVariationSettings: '"wght" 500' }}>
                  Ten features, one job: raise the opacity.
                </span>
              </ScrollReveal>
              <p className="text-balance mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/62">
                Each one takes a different kind of faint thing and brings it up.
                Some are ready now; the rest are labelled honestly, because a
                roadmap dressed as a feature list is its own kind of vague brief.
              </p>
            </Reveal>

            <div className="mt-14">
              <FeatureExplorer />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* Close                                                          */}
        {/* ------------------------------------------------------------- */}
        <section className="relative isolate overflow-hidden px-6 py-32 sm:py-44">
          <PrismaticAurora className="absolute inset-0 -z-20 h-full w-full" compact />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background: [
                "radial-gradient(105% 62% at 50% 48%, oklch(0.145 0.012 265 / 0.72) 0%, oklch(0.145 0.012 265 / 0.4) 52%, transparent 82%)",
                "linear-gradient(to bottom, oklch(0.145 0.012 265 / 0.35) 0%, oklch(0.145 0.012 265 / 0.1) 30%, oklch(0.145 0.012 265 / 0.1) 70%, oklch(0.145 0.012 265 / 0.55) 100%)",
              ].join(", "),
            }}
          />
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <Reveal>
              <h2
                className="text-balance text-3xl leading-[1.12] tracking-tight sm:text-[2.75rem]"
                style={{ fontVariationSettings: '"wght" 500' }}
              >
                {CLOSE.title}
              </h2>
              <p className="text-balance mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-foreground/62">
                {CLOSE.body}
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <div className="mt-10">
                <LandingCta />
              </div>
            </Reveal>
          </div>
        </section>

        <footer className="border-t border-white/[0.06] px-5 py-10 sm:px-8">
          <div className="mx-auto flex max-w-[1680px] flex-col items-center justify-between gap-4 sm:flex-row">
            <TitleImage width={403} height={60} className="h-[26px] w-auto" />
            <p className="text-xs text-foreground/50">
              Designed with designers in mind.
            </p>
            <Link
              href="/studio"
              className="text-xs text-foreground/55 underline-offset-4 transition-colors hover:text-foreground/90 hover:underline"
            >
              Open the studio
            </Link>
          </div>
        </footer>
      </main>
    </>
  );
}
