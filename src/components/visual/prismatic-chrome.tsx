"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle, Vec2 } from "ogl";

/**
 * Prismatic chrome background.
 *
 * Physics, not a copied snippet: fBm domain warp -> surface normal ->
 * Schlick Fresnel -> thin-film interference (the reason coated metal goes
 * rainbow) -> specular. The interference term is what makes this *prismatic*
 * rather than merely shiny.
 *
 * PERFORMANCE — this file was rewritten after the first version tanked the
 * frame rate. The original cost ~360 sin() per pixel (height() called 3x, each
 * 5 fBm x 3 octaves x 4 hashes x 2 sin) across a full-DPR canvas, i.e. well
 * over a billion transcendental ops per frame. Four changes fixed it:
 *
 *   1. RESOLUTION SCALING (biggest win). The effect is large and smooth, so it
 *      renders to a much smaller buffer and lets the browser bilinear-upscale.
 *      At 0.45x that is ~5x fewer pixels than CSS size, ~15x fewer than DPR 1.75.
 *   2. SIN-FREE HASH. Integer-style fract hashing instead of sin() — same look,
 *      no transcendentals.
 *   3. CHEAPER FIELD. 3 fBm per height instead of 5; 3 octaves instead of 5.
 *   4. OFFSCREEN PAUSE. An IntersectionObserver stops the rAF loop when the
 *      element scrolls out of view, so a second instance further down the page
 *      costs nothing while you are reading the hero.
 *
 * Combined: roughly 40-60x cheaper per frame.
 */

const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uPointer;
uniform float uIntensity;
uniform float uSpectrum;

varying vec2 vUv;

// Sin-free hash. sin() based hashing is the default in most shader snippets
// and is by far the most expensive thing in an fBm-heavy fragment shader.
vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  vec2 h = fract((p3.xx + p3.yz) * p3.zy);
  return -1.0 + 2.0 * h;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

// Height field: one warp pass instead of two. Visually near-identical at this
// scale and a third of the cost.
float height(vec2 p, float t) {
  vec2 q = vec2(
    fbm(p + vec2(0.0, t * 0.05)),
    fbm(p + vec2(5.2, 1.3) - vec2(t * 0.04, 0.0))
  );
  return fbm(p + 3.0 * q);
}

// Thin-film interference: optical path difference gives each channel a
// different phase, so R/G/B peak at different film thicknesses.
vec3 thinFilm(float thickness, float cosTheta) {
  float opd = 2.0 * thickness * max(cosTheta, 0.08);
  vec3 phase = vec3(opd) / vec3(0.68, 0.55, 0.44);
  vec3 c = 0.5 + 0.5 * cos(6.2831853 * phase + vec3(0.0, 2.094, 4.188));
  return mix(vec3(dot(c, vec3(0.333))), c, 0.82);
}

// Mostly-dark studio: narrow bright horizon + one softbox strip. Sparse
// highlights on black is what reads as polished metal; a bright average makes
// foreground type fight the backdrop.
vec3 studioEnv(vec3 r) {
  float y = r.y;
  float horizon = smoothstep(-0.10, 0.02, y) * (1.0 - smoothstep(0.05, 0.30, y));
  float softbox = smoothstep(0.62, 0.80, y) * (1.0 - smoothstep(0.86, 0.99, y));
  float ambient = smoothstep(-1.0, 1.0, y) * 0.06;
  return (horizon * 1.6 + softbox * 0.85 + ambient) * vec3(0.90, 0.94, 1.0);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = uTime;

  vec2 light2 = (uPointer - 0.5) * vec2(aspect, 1.0);

  vec2 sp = p * 0.30;
  float e = 0.0035;

  float h  = height(sp, t);
  float hx = height(sp + vec2(e, 0.0), t);
  float hy = height(sp + vec2(0.0, e), t);

  vec3 n = normalize(vec3((h - hx) / e, (h - hy) / e, 0.16));

  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 lightDir = normalize(vec3(light2 - p, 0.9));
  vec3 halfDir = normalize(lightDir + viewDir);

  float cosTheta = clamp(dot(n, viewDir), 0.0, 1.0);

  float f0 = 0.72;
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

  vec3 r = reflect(-viewDir, n);
  vec3 body = studioEnv(r) * fresnel;

  float ndh = max(dot(n, halfDir), 0.0);
  float spec = pow(ndh, 128.0) * 0.9;

  // Rainbow confined to grazing angles and specular edges, and gated on
  // whether light is actually landing there — broad-area iridescence is what
  // makes these shaders look like spilled petrol.
  float grazing = pow(1.0 - cosTheta, 4.0);
  float thickness = 0.5 + h * 2.4 + 0.1 * sin(t * 0.18);
  vec3 iri = thinFilm(thickness, cosTheta);
  float lit = clamp(dot(body, vec3(0.333)) * 2.2, 0.0, 1.0);
  float iriMask = clamp(grazing * 1.0 + spec * 0.75, 0.0, 1.0) * lit * 0.8;
  vec3 prismatic = iri * iriMask * uSpectrum;

  vec3 col = body + prismatic + vec3(spec) * 0.8;
  col *= 0.5;

  float vig = smoothstep(1.15, 0.12, length(p * vec2(0.78, 1.0)));
  col *= mix(0.06, 1.0, vig);
  col *= uIntensity;

  // Dither — smooth gradients this dark band badly in 8-bit.
  float d = fract(dot(gl_FragCoord.xy, vec2(0.0069, 0.0037)) * 43758.5453);
  col += (d - 0.5) / 255.0;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

interface PrismaticChromeProps {
  className?: string;
  /** Overall brightness. Keep low behind text. */
  intensity?: number;
  /** How strongly the rainbow reads. 0 = plain chrome. */
  spectrum?: number;
  /** Animation speed multiplier. */
  speed?: number;
  /**
   * Fraction of CSS size to render at. The field is smooth, so 0.45 upscales
   * with no visible loss while cutting fragment work by ~5x. Raise toward 1
   * only if you can afford the frames.
   */
  resolutionScale?: number;
  /**
   * When false, the light source drifts on a slow autonomous path instead
   * of following the pointer — a "live but not user-interactive" backdrop.
   * Default true preserves the original cursor-follow behaviour.
   */
  interactive?: boolean;
}

export function PrismaticChrome({
  className,
  intensity = 1,
  spectrum = 1,
  speed = 1,
  resolutionScale = 0.45,
  interactive = true,
}: PrismaticChromeProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: Renderer;
    try {
      // dpr 1 on purpose: resolutionScale governs the buffer size, and
      // multiplying by devicePixelRatio on top is what made this unaffordable
      // on retina displays.
      renderer = new Renderer({ alpha: false, antialias: false, dpr: 1 });
    } catch {
      return; // No WebGL — the CSS gradient fallback below stands in.
    }

    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2(1, 1) },
        uPointer: { value: new Vec2(0.5, 0.42) },
        uIntensity: { value: intensity },
        uSpectrum: { value: spectrum },
      },
    });

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const w = Math.max(1, Math.round(host.clientWidth * resolutionScale));
      const h = Math.max(1, Math.round(host.clientHeight * resolutionScale));
      renderer.setSize(w, h);
      // Keep the canvas stretched over the host regardless of buffer size.
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      program.uniforms.uResolution.value.set(w, h);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const target = { x: 0.5, y: 0.42 };
    const current = { x: 0.5, y: 0.42 };
    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      target.x = (e.clientX - rect.left) / rect.width;
      target.y = 1 - (e.clientY - rect.top) / rect.height;
    };
    if (interactive) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    let raf = 0;
    let visible = true;
    let running = false;
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - start) / 1000;
      if (!interactive) {
        // Slow Lissajous drift — different x/y frequencies so the light
        // source wanders without ever visibly repeating on a human timescale.
        target.x = 0.5 + 0.3 * Math.sin(t * 0.11);
        target.y = 0.42 + 0.2 * Math.sin(t * 0.075 + 1.3);
      }
      current.x += (target.x - current.x) * 0.045;
      current.y += (target.y - current.y) * 0.045;
      program.uniforms.uPointer.value.set(current.x, current.y);
      program.uniforms.uTime.value = t * speed;
      renderer.render({ scene: mesh });
    };

    const play = () => {
      if (running || reduceMotion) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const pause = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };

    if (reduceMotion) {
      program.uniforms.uTime.value = 12;
      renderer.render({ scene: mesh });
    }

    // Only animate while actually on screen. Without this, a second instance
    // lower down the page burns GPU the entire time you are reading the hero.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (reduceMotion) {
          if (visible) renderer.render({ scene: mesh });
          return;
        }
        if (visible && !document.hidden) play();
        else pause();
      },
      { rootMargin: "120px" },
    );
    io.observe(host);

    const onVisibility = () => {
      if (document.hidden) pause();
      else if (visible) play();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      pause();
      io.disconnect();
      ro.disconnect();
      if (interactive) window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [intensity, spectrum, speed, resolutionScale, interactive]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={className}
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, oklch(0.24 0.02 262) 0%, oklch(0.145 0.012 265) 60%)",
        // Isolate this subtree from the rest of the page's paint work.
        contain: "strict",
      }}
    />
  );
}
