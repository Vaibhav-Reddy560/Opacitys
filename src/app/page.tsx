import Link from "next/link";
import dynamic from "next/dynamic";
import { TitleImage } from "@/components/brand/title-image";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { SpectrumRule } from "@/components/brand/spectrum-rule";
import { LandingCta } from "@/components/landing/landing-cta";
import { SiteNav } from "@/components/landing/site-nav";
import { SectionHeader } from "@/components/landing/section-header";
import { Section } from "@/components/landing/section";
import { ScrollProgress } from "@/components/landing/scroll-progress";
import { PrismaticBackdrop } from "@/components/visual/prismatic-backdrop";
import { SpectralScale } from "@/components/landing/spectral-scale";
import { HERO, OPACITY_STAGES, CLOSE } from "@/lib/copy";

// No "use client" here — every one of these sections already declares its
// own (motion/scroll/drag effects all need a browser either way), so this
// file staying a Server Component doesn't change what runs on the client,
// only how it's bundled: the sections below the first scroll — heavier,
// motion-driven, and not needed for the hero to paint or become
// interactive — get their own lazy-loaded chunks instead of being merged
// into one monolithic client bundle with the hero. Still server-rendered
// (no `ssr: false`) — real content on first response, not a loading flash.
const OpacityReveal = dynamic(() => import("@/components/landing/opacity-reveal").then((m) => m.OpacityReveal));
const StickyFrictions = dynamic(() => import("@/components/landing/sticky-frictions").then((m) => m.StickyFrictions));
const SpectrumSplit = dynamic(() => import("@/components/landing/spectrum-split").then((m) => m.SpectrumSplit));
const FeatureExplorer = dynamic(() => import("@/components/landing/feature-explorer").then((m) => m.FeatureExplorer));

export default function Home() {
  return (
    <>
      <SiteNav />
      <ScrollProgress />

      <main className="relative">
        {/* ------------------------------------------------------------- */}
        {/* Hero + belt — one min-h-svh unit, on purpose. Two things asked   */}
        {/* for in the same breath read as contradictory but aren't: the    */}
        {/* belt must be visible with zero scrolling, and nothing past it   */}
        {/* (the "how" section) should be — i.e. it should behave like a    */}
        {/* normal fold, not have the next section's heading peeking in.    */}
        {/* Putting hero and belt inside one `min-h-svh` flex column        */}
        {/* guarantees both at once, on any viewport: this block always     */}
        {/* fills at least the full screen height, the belt sits at its own */}
        {/* natural size at the bottom of it, and the hero content (flex-1) */}
        {/* centers in whatever space is left above the belt. Previously    */}
        {/* the belt lived in normal flow *after* a fixed-height hero — on  */}
        {/* short viewports the hero alone consumed the screen and pushed   */}
        {/* the belt below the fold; on short *content* (this hero) with no */}
        {/* min-height at all, the next section's own top padding started   */}
        {/* peeking through instead. Neither is this: the fold is always    */}
        {/* exactly "hero + belt," full stop.                               */}
        {/* ------------------------------------------------------------- */}
        <div className="relative flex min-h-svh flex-col">
          <section className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-6 pt-16 pb-10">
            {/* Slightly dimmer than the component's own default (1), and with
                deepFade so the rays recede into the dark well before the
                bottom of the section instead of staying near-full-strength
                past the fold — this section only, per the close section
                keeping the standard falloff. */}
            <PrismaticBackdrop intensity={0.9} deepFade />

            <div className="relative flex w-full max-w-5xl flex-col items-center text-center">
              {/* The light source sits just above the top edge, so the wordmark
                  is the first thing the beam lands on — the mark is *in* the
                  dispersion, not sitting on a backdrop behind it. */}
              <Reveal delay={0.05}>
                <TitleImage
                  width={1200}
                  height={179}
                  className="w-full max-w-[280px] sm:max-w-md md:max-w-xl lg:max-w-2xl h-auto"
                  size="hero"
                  priority
                />
              </Reveal>

              {/* Moved to sit directly under the wordmark — light splitting
                  out of the mark reads better than a rule floating between
                  two blocks of text. */}
              <Reveal delay={0.15} className="mt-5 w-full max-w-md">
                <SpectrumRule />
              </Reveal>

              <Reveal delay={0.25}>
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

              <Reveal delay={0.35}>
                <p className="text-balance mt-6 max-w-xl text-center text-[14px] leading-relaxed tracking-wide text-foreground/68 sm:text-[15px]">
                  <span
                    className="text-foreground"
                    style={{ fontVariationSettings: '"wght" 550' }}
                  >
                    Opacitys
                  </span>
                  {HERO.lede.slice("Opacitys".length)}
                </p>
              </Reveal>

              <Reveal delay={0.45}>
                <div className="mt-10">
                  <LandingCta />
                </div>
              </Reveal>
            </div>
          </section>

          {/* Belt — the nine-dimension vocabulary, as a static instrument
              scale rather than a scrolling marquee. Natural height, not
              flex-1 — pinned at the bottom of the min-h-svh block above. */}
          <div className="border-y border-white/[0.06] bg-white/[0.012] py-9">
            <SpectralScale />
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* What the name means — the metaphor, made draggable             */}
        {/* ------------------------------------------------------------- */}
        <Section id="how" width="wide" className="scroll-mt-20 overflow-hidden">
          <Parallax depth={0.22} className="pointer-events-none absolute -right-24 top-10 -z-10 size-[420px] rounded-full opacity-30 blur-[110px]" >
            <div className="size-full rounded-full" style={{ background: "oklch(0.62 0.2 265)" }} />
          </Parallax>

          <div className="grid items-center gap-16 lg:grid-cols-[1fr_1fr]">
            <div>
              <SectionHeader
                eyebrow="What the name means"
                title="Design is a slow rise from faint to fully there."
                lede="Opacity is how visible something is. The work of designing is raising it — from a shape you can only half picture, to something every part of which you could defend out loud. Drag the handle."
                ledeClassName="max-w-md"
              />

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
        </Section>

        {/* ------------------------------------------------------------- */}
        {/* The frictions — pinned heading, scrolling problems             */}
        {/* ------------------------------------------------------------- */}
        <Section width="wide">
          <StickyFrictions />
        </Section>

        {/* ------------------------------------------------------------- */}
        {/* The spectrum, explained                                       */}
        {/* ------------------------------------------------------------- */}
        <Section id="spectrum" className="scroll-mt-20 overflow-hidden">
          <SectionHeader
            eyebrow="The spectrum"
            title="One reading, split into nine."
            lede="Scroll — the same way a prism does it."
            titleClassName="max-w-2xl"
            ledeClassName="max-w-xl"
          />

          <div className="mt-16">
            <SpectrumSplit />
          </div>
        </Section>

        {/* ------------------------------------------------------------- */}
        {/* The ten features                                               */}
        {/* ------------------------------------------------------------- */}
        <Section id="studio" width="wide" className="scroll-mt-20">
          <SectionHeader
            eyebrow="The studio"
            title="Ten features, one job: raise the opacity."
            lede="Each one takes a different kind of faint thing and brings it up. Some are ready now; the rest are labelled honestly, because a roadmap dressed as a feature list is its own kind of vague brief."
            titleClassName="max-w-2xl"
            ledeClassName="max-w-2xl"
          />

          <div className="mt-14">
            <FeatureExplorer />
          </div>
        </Section>

        {/* ------------------------------------------------------------- */}
        {/* Close                                                          */}
        {/* ------------------------------------------------------------- */}
        <Section tone="prism" divider={false}>
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
        </Section>

        <footer className="border-t border-white/[0.06] px-5 py-10 sm:px-8">
          {/* grid-cols-3, not flex justify-between: with three items of
              different widths, justify-between only pushes the outer two to
              the edges — the middle one lands wherever that leaves it, not
              at the true centre of the row (it was visibly left-of-centre,
              since the wordmark is narrower than the "Open the studio"
              link). Three equal columns, each item justified within its own
              column, is what actually centres the middle one. */}
          <div className="mx-auto flex max-w-[1680px] flex-col items-center gap-4 sm:grid sm:grid-cols-3 sm:items-center">
            {/* Same TitleImage call as SiteNav, same display height, so the
                mark is identically sized in both places. */}
            <div className="h-[26px] sm:justify-self-start">
              <TitleImage width={1200} height={158} className="h-[26px] w-auto" size="compact" />
            </div>
            <p className="text-xs text-foreground/50 sm:justify-self-center">
              Designed with designers in mind.
            </p>
            <Link
              href="/studio"
              className="text-xs text-foreground/55 underline-offset-4 transition-colors hover:text-foreground/90 hover:underline sm:justify-self-end"
            >
              Open the studio
            </Link>
          </div>
        </footer>
      </main>
    </>
  );
}
