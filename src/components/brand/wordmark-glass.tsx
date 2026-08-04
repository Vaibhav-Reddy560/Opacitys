"use client";

import { useEffect, useRef, useState } from "react";
import { Mesh, type OGLRenderingContext, Program, Renderer, RenderTarget, Texture, Triangle } from "ogl";
import { cn } from "@/lib/utils";
import { useGlyphField } from "@/lib/glyph-sdf/use-glyph-field";
import { cloneTuning, DEFAULT_TUNING, type GlassTuning } from "./glass-tuning";
import {
  BLUR_FRAG,
  BRIGHTPASS_FRAG,
  buildGlassFragment,
  COMPOSITE_FRAG,
  DOWNSAMPLE_FRAG,
  PLACEHOLDER_FRAG,
  VERT,
} from "./glass-shader";
import { Wordmark } from "./wordmark";

/**
 * The dispersive-glass wordmark — a from-scratch WebGL render (SDF tube
 * geometry + a refractive/reflective glass material + a studio environment
 * that rotates with the cursor + a hand-rolled mip-chain bloom) built to
 * chase a specific reference: "OPACITYS" rendered as extruded glass rods
 * with hard specular bands and spectral fringing. See the plan file for the
 * full optical derivation; `glass-shader.ts` carries the short version.
 *
 * This is deliberately NOT a replacement for `<Wordmark>` (the SVG-filter
 * chrome title) — that component is unmodified and stays in use everywhere
 * except the hero, specifically so the two can be A/B'd. `<Wordmark>` also
 * stays mounted here (invisible) as the permanent LAYOUT owner: its ink
 * bbox — not a plain span's font-box — is what every other call site's
 * spacing already assumes, and swapping between differently-sized boxes on
 * mode changes would shift the page. See the render tree below.
 *
 * Fallback to `<Wordmark>` on: prefers-reduced-motion, no WebGL, a WebGL
 * context loss, or the SDF pipeline reporting the font never verified as
 * loaded (never ship a glass render of a generic fallback typeface). Coarse
 * pointers (touch) get the full glass material rendered once at a fixed key
 * angle, then frozen — there's no cursor to drive it.
 *
 * One GL context per instance, so this is hero-only by policy — browsers
 * cap concurrent WebGL contexts (~8-16), and building/holding an SDF field
 * per instance isn't free either.
 */

type Mode = "pending" | "gl" | "gl-static" | "fallback";

interface Targets {
  scene: RenderTarget;
  half: RenderTarget;
  halfTmp: RenderTarget;
  quarter: RenderTarget;
  quarterTmp: RenderTarget;
  eighth: RenderTarget;
  eighthTmp: RenderTarget;
}

interface Meshes {
  scene: Mesh;
  bright: Mesh;
  down: Mesh;
  blur: Mesh;
  composite: Mesh;
}

export interface WordmarkGlassStats {
  fps: number;
  frameMs: number;
  samples: number;
  renderScale: number;
  buildMs: number;
  radiusPx: number;
  radiusMean: number;
  radiusAreaPerim: number;
  hdr: boolean;
  mode: Mode;
}

export interface WordmarkGlassProps {
  className?: string;
  text?: string;
  interactive?: boolean;
  /** Lab-only live overrides, merged onto DEFAULT_TUNING. Changing this never tears down the GL context except when `samples` changes (see glass-tuning.ts). */
  tuning?: Partial<GlassTuning>;
  /** Lab-only escape hatch to force a treatment instead of auto-detecting. */
  forceMode?: "auto" | "gl" | "fallback";
  /** Lab-only: 0 = off, 1 = ∇d, 2 = normal, 3 = t, 4 = h, 5 = Fresnel, 6 = coverage. */
  debug?: number;
  onStats?: (stats: WordmarkGlassStats) => void;
}

const IDLE_EPSILON = 1e-4;
const GOVERNOR_WINDOW = 30;
const GOVERNOR_BUDGET_MS = 20;

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function WordmarkGlass({
  className,
  text = "OPACITYS",
  interactive = true,
  tuning,
  forceMode = "auto",
  debug = 0,
  onStats,
}: WordmarkGlassProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("pending");
  const [maxTextureSize, setMaxTextureSize] = useState<number | undefined>(undefined);

  // --- gate: decide, client-only, whether to even attempt WebGL -----------
  useEffect(() => {
    if (forceMode === "fallback") {
      setMode("fallback");
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setMode("fallback");
      return;
    }
    if (forceMode !== "gl" && !supportsWebGL()) {
      setMode("fallback");
      return;
    }
    const coarse = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setMode(coarse ? "gl-static" : "gl");
  }, [forceMode]);

  const glEnabled = mode === "gl" || mode === "gl-static";
  const { field, status } = useGlyphField({ hostRef, text, maxTextureSize, enabled: glEnabled });

  useEffect(() => {
    if (status === "failed") setMode("fallback");
  }, [status]);

  // --- tuning: kept in a ref so the render loop always reads the latest
  // value without the setup effect depending on the (possibly-new-identity-
  // every-render) `tuning` object. Only `samples` needs its own effect,
  // since changing it requires a Program rebuild rather than a uniform set.
  const tuningRef = useRef<GlassTuning>(cloneTuning(DEFAULT_TUNING, tuning));
  useEffect(() => {
    tuningRef.current = cloneTuning(DEFAULT_TUNING, tuning);
    // Idle-freeze means the rAF chain can be fully stopped by the time a
    // slider changes this ref — without waking it, the lab would only ever
    // reflect a new value once the pointer happens to move over the canvas.
    dirtyRef.current = true;
    wakeRef.current?.();
  });
  const samples = tuning?.samples ?? DEFAULT_TUNING.samples;
  const debugRef = useRef(debug);
  useEffect(() => {
    debugRef.current = debug;
    dirtyRef.current = true;
    wakeRef.current?.();
  });

  // --- refs shared between the setup effect, the program-rebuild effect,
  // and the texture-upload effect, all of which run independently.
  const glRef = useRef<OGLRenderingContext | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const targetsRef = useRef<Targets | null>(null);
  const meshesRef = useRef<Meshes | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const fieldMetaRef = useRef<{ radiusPx: number; aaRange: number; padCss: number; inkWidthCss: number; inkHeightCss: number } | null>(null);
  const hdrRef = useRef(false);
  const renderScaleRef = useRef(1);
  const dirtyRef = useRef(true); // forces at least one render after any setup change
  const statsRef = useRef({ frames: 0, lastFpsTime: 0, fps: 0 });
  /**
   * Populated by effect A with its `play()`. The idle-freeze means the rAF
   * chain can fully stop (no pending `requestAnimationFrame`) before the
   * async SDF field/texture arrives or a slider changes `tuningRef` — at
   * that point nothing is polling `dirtyRef` anymore, so setting it alone
   * does nothing. Every other effect that mutates render state must also
   * call `wakeRef.current?.()` to actually restart the loop.
   */
  const wakeRef = useRef<(() => void) | null>(null);

  // --- effect A: renderer, targets, post meshes, rAF loop, observers.
  // Depends only on primitives (mode, text) — never on `tuning` or `field`
  // directly, so slider drags and SDF rebuilds can't tear this down.
  useEffect(() => {
    if (!glEnabled) return;
    const host = canvasHostRef.current;
    const outer = hostRef.current;
    if (!host || !outer) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, antialias: false, dpr: 1, depth: false, premultipliedAlpha: false });
    } catch {
      setMode("fallback");
      return;
    }
    const gl = renderer.gl;
    if (!gl) {
      setMode("fallback");
      return;
    }
    glRef.current = gl;
    rendererRef.current = renderer;
    gl.clearColor(0, 0, 0, 0);

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    // Captured as a local, not read back from the `maxTextureSize` state
    // below: that state exists to feed `useGlyphField` (a separate consumer
    // outside this effect), but `resize()`'s closure needs the value
    // immediately and stably for this effect's whole lifetime — routing it
    // through state here would mean `resize()` closes over the stale
    // pre-mount value (undefined) since `setMaxTextureSize` firing inside
    // this same effect doesn't retroactively update an already-created closure.
    const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    setMaxTextureSize(maxTexSize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setMode("fallback");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    // --- HDR probe: RGBA16F render targets if the extension is present
    // (ogl requests webgl2 first and already probes EXT_color_buffer_float
    // at Renderer construction on WebGL2). Falls back to RGBA8 + preExposure.
    const hdr = renderer.isWebgl2 && !!gl.getExtension("EXT_color_buffer_float");
    hdrRef.current = hdr;
    const rtType = hdr ? (gl as WebGL2RenderingContext).HALF_FLOAT : gl.UNSIGNED_BYTE;
    const rtInternalFormat = hdr ? (gl as WebGL2RenderingContext).RGBA16F : gl.RGBA;

    function makeTarget(w: number, h: number): RenderTarget {
      return new RenderTarget(gl!, {
        width: Math.max(1, w),
        height: Math.max(1, h),
        depth: false,
        type: rtType,
        internalFormat: rtInternalFormat,
        format: gl!.RGBA,
        minFilter: gl!.LINEAR,
        magFilter: gl!.LINEAR,
        wrapS: gl!.CLAMP_TO_EDGE,
        wrapT: gl!.CLAMP_TO_EDGE,
      });
    }

    // Placeholder 1x1 targets — resized for real on the first `resize()` call below.
    const targets: Targets = {
      scene: makeTarget(1, 1),
      half: makeTarget(1, 1),
      halfTmp: makeTarget(1, 1),
      quarter: makeTarget(1, 1),
      quarterTmp: makeTarget(1, 1),
      eighth: makeTarget(1, 1),
      eighthTmp: makeTarget(1, 1),
    };
    targetsRef.current = targets;

    const triangle = new Triangle(gl);

    const brightProgram = new Program(gl, {
      vertex: VERT,
      fragment: BRIGHTPASS_FRAG,
      uniforms: {
        uSource: { value: targets.scene.texture },
        uSourceTexel: { value: [1, 1] },
        uThreshold: { value: DEFAULT_TUNING.threshold },
        uKnee: { value: DEFAULT_TUNING.knee },
      },
    });
    const downProgram = new Program(gl, {
      vertex: VERT,
      fragment: DOWNSAMPLE_FRAG,
      uniforms: { uSource: { value: targets.half.texture }, uSourceTexel: { value: [1, 1] } },
    });
    const blurProgram = new Program(gl, {
      vertex: VERT,
      fragment: BLUR_FRAG,
      uniforms: {
        uSource: { value: targets.half.texture },
        uSourceTexel: { value: [1, 1] },
        uDirection: { value: [1, 0] },
      },
    });
    const compositeProgram = new Program(gl, {
      vertex: VERT,
      fragment: COMPOSITE_FRAG,
      transparent: true,
      uniforms: {
        uScene: { value: targets.scene.texture },
        uBloom1: { value: targets.half.texture },
        uBloom2: { value: targets.quarter.texture },
        uBloom3: { value: targets.eighth.texture },
        uBloomGain1: { value: DEFAULT_TUNING.bloomGain1 },
        uBloomGain2: { value: DEFAULT_TUNING.bloomGain2 },
        uBloomGain3: { value: DEFAULT_TUNING.bloomGain3 },
        uAlphaGain: { value: 4.0 },
        uPreExposure: { value: DEFAULT_TUNING.preExposure },
        uHdr: { value: hdr ? 1 : 0 },
        uDebugBloom: { value: 0 },
      },
    });

    const placeholderProgram = new Program(gl, { vertex: VERT, fragment: PLACEHOLDER_FRAG });

    const meshes: Meshes = {
      // Replaced by effect B (needs `samples` + the SDF texture, both async)
      // — deliberately an inert shader with no render-target sampler, not
      // `brightProgram`; see PLACEHOLDER_FRAG's doc comment for why.
      scene: new Mesh(gl, { geometry: triangle, program: placeholderProgram }),
      bright: new Mesh(gl, { geometry: triangle, program: brightProgram }),
      down: new Mesh(gl, { geometry: triangle, program: downProgram }),
      blur: new Mesh(gl, { geometry: triangle, program: blurProgram }),
      composite: new Mesh(gl, { geometry: triangle, program: compositeProgram }),
    };
    meshesRef.current = meshes;

    // --- pointer + resize state ---------------------------------------
    const pointerTarget = { x: 0.62, y: 0.32 };
    const pointerCurrent = { x: 0.62, y: 0.32 };
    let aspect = 1;

    const onPointerMove = (e: PointerEvent) => {
      const rect = outer.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerTarget.x = (e.clientX - rect.left) / rect.width;
      pointerTarget.y = (e.clientY - rect.top) / rect.height;
      dirtyRef.current = true;
      play();
    };
    if (mode === "gl") window.addEventListener("pointermove", onPointerMove, { passive: true });

    const resize = () => {
      const cssW = outer.clientWidth || 1;
      const cssH = outer.clientHeight || 1;
      const dprCap = Math.min(2, maxTexSize / cssW);
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap));
      const scale = renderScaleRef.current;
      const w = Math.max(1, Math.round(cssW * dpr * scale));
      const h = Math.max(1, Math.round(cssH * dpr * scale));
      aspect = w / h;
      renderer.setSize(w, h);
      canvas.style.width = "100%";
      canvas.style.height = "100%";

      targets.scene.setSize(w, h);
      targets.half.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
      targets.halfTmp.setSize(targets.half.width, targets.half.height);
      targets.quarter.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
      targets.quarterTmp.setSize(targets.quarter.width, targets.quarter.height);
      targets.eighth.setSize(Math.max(1, w >> 3), Math.max(1, h >> 3));
      targets.eighthTmp.setSize(targets.eighth.width, targets.eighth.height);
      dirtyRef.current = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(outer);

    // --- adaptive governor: rolling frame time -> step down render scale --
    const frameTimes: number[] = [];
    function recordFrame(ms: number) {
      frameTimes.push(ms);
      if (frameTimes.length > GOVERNOR_WINDOW) frameTimes.shift();
      if (frameTimes.length < GOVERNOR_WINDOW) return;
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median > GOVERNOR_BUDGET_MS && renderScaleRef.current > 0.75) {
        renderScaleRef.current = renderScaleRef.current > 0.9 ? 0.85 : 0.75;
        frameTimes.length = 0;
        resize();
      }
    }

    let raf = 0;
    let running = false;
    let visible = true;
    let staticRendered = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function renderFrame() {
      if (!glRef.current || !rendererRef.current || !targetsRef.current || !meshesRef.current) return;
      const t = tuningRef.current;
      const scene = meshesRef.current.scene;
      const sceneProgram = scene.program;
      const u = sceneProgram.uniforms;

      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * t.smoothing;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * t.smoothing;

      const yaw = (pointerCurrent.x - 0.5) * t.yawRange;
      const pitch = (pointerCurrent.y - 0.5) * t.pitchRange;

      if (u.uAspect) u.uAspect.value = aspect;
      if (u.uPointer) (u.uPointer.value as number[]) = [pointerCurrent.x, 1 - pointerCurrent.y];
      if (u.uEnvCosYaw) u.uEnvCosYaw.value = Math.cos(yaw);
      if (u.uEnvSinYaw) u.uEnvSinYaw.value = Math.sin(yaw);
      if (u.uEnvCosPitch) u.uEnvCosPitch.value = Math.cos(pitch);
      if (u.uEnvSinPitch) u.uEnvSinPitch.value = Math.sin(pitch);
      if (u.uPerspective) u.uPerspective.value = t.perspective;
      if (u.uParallax) u.uParallax.value = t.parallax;
      if (u.uIor) u.uIor.value = t.ior;
      if (u.uDispersion) u.uDispersion.value = t.dispersion;
      if (u.uF0) u.uF0.value = t.f0;
      if (u.uFresnelPower) u.uFresnelPower.value = t.fresnelPower;
      if (u.uAbsorb) u.uAbsorb.value = t.absorb;
      if (u.uReflGain) u.uReflGain.value = t.reflGain;
      if (u.uTransGain) u.uTransGain.value = t.transGain;
      if (u.uPipe) u.uPipe.value = t.pipe;
      if (u.uSpreadFalloff) u.uSpreadFalloff.value = t.spreadFalloff;
      if (u.uKeyElev) u.uKeyElev.value = t.keyElev;
      if (u.uKeyWidth) u.uKeyWidth.value = t.keyWidth;
      if (u.uKeyGain) u.uKeyGain.value = t.keyGain;
      if (u.uKeyAzWidth) u.uKeyAzWidth.value = t.keyAzWidth;
      if (u.uKeyDirectional) u.uKeyDirectional.value = t.keyDirectional;
      if (u.uRimElev) u.uRimElev.value = t.rimElev;
      if (u.uRimWidth) u.uRimWidth.value = t.rimWidth;
      if (u.uRimGain) u.uRimGain.value = t.rimGain;
      if (u.uAmbGain) u.uAmbGain.value = t.ambGain;
      if (u.uExposure) u.uExposure.value = t.exposure;
      if (u.uDebug) u.uDebug.value = debugRef.current;
      if (u.uRadiusScale) u.uRadiusScale.value = t.radiusScale;
      if (fieldMetaRef.current) {
        if (u.uRadiusPx) u.uRadiusPx.value = fieldMetaRef.current.radiusPx;
        if (u.uAaRange) u.uAaRange.value = fieldMetaRef.current.aaRange;
      }
      if (u.uTube) u.uTube.value = textureRef.current;

      const targets = targetsRef.current;
      const meshes = meshesRef.current;
      const r = rendererRef.current;

      r.render({ scene, target: targets.scene, clear: true });

      // bright-pass + downsample to half
      const bp = meshes.bright.program.uniforms;
      bp.uSource.value = targets.scene.texture;
      (bp.uSourceTexel.value as number[]) = [1 / targets.scene.width, 1 / targets.scene.height];
      bp.uThreshold.value = t.threshold;
      bp.uKnee.value = t.knee;
      r.render({ scene: meshes.bright, target: targets.half, clear: true });

      blurLevel(targets.half, targets.halfTmp);
      downsample(targets.half, targets.quarter);
      blurLevel(targets.quarter, targets.quarterTmp);
      downsample(targets.quarter, targets.eighth);
      blurLevel(targets.eighth, targets.eighthTmp);

      const cu = meshes.composite.program.uniforms;
      cu.uScene.value = targets.scene.texture;
      cu.uBloom1.value = targets.half.texture;
      cu.uBloom2.value = targets.quarter.texture;
      cu.uBloom3.value = targets.eighth.texture;
      cu.uBloomGain1.value = t.bloomGain1;
      cu.uBloomGain2.value = t.bloomGain2;
      cu.uBloomGain3.value = t.bloomGain3;
      cu.uPreExposure.value = t.preExposure;
      cu.uDebugBloom.value = 0;
      r.render({ scene: meshes.composite, target: undefined, clear: true });

      function downsample(src: RenderTarget, dst: RenderTarget) {
        const du = meshes.down.program.uniforms;
        du.uSource.value = src.texture;
        (du.uSourceTexel.value as number[]) = [1 / src.width, 1 / src.height];
        r.render({ scene: meshes.down, target: dst, clear: true });
      }
      function blurLevel(main: RenderTarget, tmp: RenderTarget) {
        const bu = meshes.blur.program.uniforms;
        bu.uSource.value = main.texture;
        (bu.uSourceTexel.value as number[]) = [1 / main.width, 1 / main.height];
        (bu.uDirection.value as number[]) = [1, 0];
        r.render({ scene: meshes.blur, target: tmp, clear: true });
        bu.uSource.value = tmp.texture;
        (bu.uDirection.value as number[]) = [0, 1];
        r.render({ scene: meshes.blur, target: main, clear: true });
      }

      const isMoving = Math.abs(pointerTarget.x - pointerCurrent.x) + Math.abs(pointerTarget.y - pointerCurrent.y) > IDLE_EPSILON;
      dirtyRef.current = isMoving || t.driftSpeed > 0;
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      if (mode === "gl-static") {
        if (staticRendered) {
          running = false;
          cancelAnimationFrame(raf);
          return;
        }
        pointerCurrent.x = pointerTarget.x;
        pointerCurrent.y = pointerTarget.y;
        renderFrame();
        staticRendered = true;
        running = false;
        cancelAnimationFrame(raf);
        return;
      }
      if (!dirtyRef.current) {
        running = false;
        cancelAnimationFrame(raf);
        return;
      }
      const start = performance.now();
      renderFrame();
      const frameMs = performance.now() - start;
      recordFrame(frameMs);

      statsRef.current.frames++;
      if (now - statsRef.current.lastFpsTime > 500) {
        statsRef.current.fps = (statsRef.current.frames * 1000) / Math.max(1, now - statsRef.current.lastFpsTime);
        statsRef.current.frames = 0;
        statsRef.current.lastFpsTime = now;
        onStats?.({
          fps: statsRef.current.fps,
          frameMs,
          samples: tuningRef.current.samples,
          renderScale: renderScaleRef.current,
          buildMs: fieldMetaRef.current ? 0 : 0,
          radiusPx: fieldMetaRef.current?.radiusPx ?? 0,
          radiusMean: 0,
          radiusAreaPerim: 0,
          hdr: hdrRef.current,
          mode,
        });
      }
    }

    function play() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          dirtyRef.current = true;
          play();
        }
      },
      { rootMargin: "80px" },
    );
    io.observe(outer);

    const onVisibility = () => {
      if (!document.hidden && visible) play();
    };
    document.addEventListener("visibilitychange", onVisibility);

    wakeRef.current = play;
    play();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (wakeRef.current === play) wakeRef.current = null;

      textureRef.current?.gl.deleteTexture(textureRef.current.texture);
      textureRef.current = null;

      for (const target of Object.values(targets)) {
        gl.deleteFramebuffer(target.buffer);
        gl.deleteTexture(target.texture.texture);
      }
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();

      glRef.current = null;
      rendererRef.current = null;
      targetsRef.current = null;
      meshesRef.current = null;
    };
    // Deps are deliberately primitives-only: `tuning` and `field` are read
    // through refs (tuningRef, fieldMetaRef, textureRef) rather than closed
    // over directly, so slider drags and SDF rebuilds never tear this
    // effect down and rebuild the whole renderer (plan risk R15).
  }, [glEnabled, mode, text, onStats]);

  // --- effect B: (re)build the scene Program when `samples` changes. Every
  // other tuning field is a plain uniform update inside the render loop.
  useEffect(() => {
    const gl = glRef.current;
    const meshes = meshesRef.current;
    if (!gl || !meshes) return;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: buildGlassFragment(samples),
      transparent: true,
      uniforms: {
        uTube: { value: textureRef.current },
        uAspect: { value: 1 },
        uRadiusPx: { value: fieldMetaRef.current?.radiusPx ?? 10 },
        uRadiusScale: { value: DEFAULT_TUNING.radiusScale },
        uAaRange: { value: fieldMetaRef.current?.aaRange ?? 6 },
        uIor: { value: DEFAULT_TUNING.ior },
        uDispersion: { value: DEFAULT_TUNING.dispersion },
        uF0: { value: DEFAULT_TUNING.f0 },
        uFresnelPower: { value: DEFAULT_TUNING.fresnelPower },
        uAbsorb: { value: DEFAULT_TUNING.absorb },
        uReflGain: { value: DEFAULT_TUNING.reflGain },
        uTransGain: { value: DEFAULT_TUNING.transGain },
        uPipe: { value: DEFAULT_TUNING.pipe },
        uSpreadFalloff: { value: DEFAULT_TUNING.spreadFalloff },
        uKeyElev: { value: DEFAULT_TUNING.keyElev },
        uKeyWidth: { value: DEFAULT_TUNING.keyWidth },
        uKeyGain: { value: DEFAULT_TUNING.keyGain },
        uKeyAzWidth: { value: DEFAULT_TUNING.keyAzWidth },
        uKeyDirectional: { value: DEFAULT_TUNING.keyDirectional },
        uRimElev: { value: DEFAULT_TUNING.rimElev },
        uRimWidth: { value: DEFAULT_TUNING.rimWidth },
        uRimGain: { value: DEFAULT_TUNING.rimGain },
        uAmbGain: { value: DEFAULT_TUNING.ambGain },
        uEnvCosYaw: { value: 1 },
        uEnvSinYaw: { value: 0 },
        uEnvCosPitch: { value: 1 },
        uEnvSinPitch: { value: 0 },
        uPointer: { value: [0.5, 0.5] },
        uPerspective: { value: DEFAULT_TUNING.perspective },
        uParallax: { value: DEFAULT_TUNING.parallax },
        uExposure: { value: DEFAULT_TUNING.exposure },
        uDebug: { value: debugRef.current },
      },
    });

    meshes.scene = new Mesh(gl, { geometry: meshes.bright.geometry, program });
    dirtyRef.current = true;
    wakeRef.current?.();
  }, [samples, field]); // `field` too: a fresh texture after a rebuild still needs `scene` to exist on first mount

  // --- effect C: upload a new glyph texture whenever the SDF field changes.
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !field) return;

    const texture = new Texture(gl, {
      image: field.texture,
      width: field.width,
      height: field.height,
      format: gl.RGBA,
      internalFormat: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      flipY: false,
      premultiplyAlpha: false,
    });

    const previous = textureRef.current;
    textureRef.current = texture;
    fieldMetaRef.current = {
      radiusPx: field.radiusPx,
      aaRange: field.aaRange,
      padCss: field.padCss,
      inkWidthCss: field.inkWidthCss,
      inkHeightCss: field.inkHeightCss,
    };

    if (meshesRef.current?.scene) {
      const u = meshesRef.current.scene.program.uniforms;
      if (u.uTube) u.uTube.value = texture;
    }
    dirtyRef.current = true;
    wakeRef.current?.();

    if (previous) {
      previous.gl.deleteTexture(previous.texture);
    }
  }, [field]);

  const showGl = mode === "gl" || mode === "gl-static";
  const meta = fieldMetaRef.current;

  return (
    <div ref={hostRef} className={cn("relative inline-block", className)} style={{ fontFamily: "var(--font-wordmark)" }}>
      <div className={showGl ? "invisible" : undefined}>
        <Wordmark text={text} interactive={mode !== "gl" && interactive} />
      </div>
      {showGl && (
        <div
          ref={canvasHostRef}
          role="img"
          aria-label={text}
          className="pointer-events-none absolute"
          style={{
            left: meta ? -meta.padCss : 0,
            top: meta ? -meta.padCss : 0,
            width: meta ? meta.inkWidthCss + meta.padCss * 2 : "100%",
            height: meta ? meta.inkHeightCss + meta.padCss * 2 : "100%",
          }}
        />
      )}
    </div>
  );
}
