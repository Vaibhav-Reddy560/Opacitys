/**
 * GLSL for the dispersive-glass wordmark. Written in plain GLSL ES 1.00
 * (attribute/varying/texture2D, no `#version` pragma) — same convention as
 * `prismatic-chrome.tsx`; WebGL2 contexts compile ES 1.00 shaders fine
 * without the pragma, and ogl does no source transformation of its own.
 *
 * The optical model (why each formula is what it is) is worked out and
 * numerically verified in the plan file. Short version, so this file reads
 * standalone:
 *
 *  - Tube normal N = vec3(-g*(1-t), h), g = unit ∇d, h = sqrt(2t-t²). This
 *    is already unit length (no normalize/singularity) — see the plan.
 *  - The bright band is the REFLECTED KEY LIGHT, not Fresnel — Schlick⁵
 *    reaches half strength at t≈0.01 (a sub-pixel hairline at realistic
 *    stroke widths), while the reference's band is ~25% of the stroke.
 *    `env()`'s uKeyElev/uKeyWidth own the band; Fresnel owns the silhouette.
 *  - Transmission needs TWO refractions (enter, exit) — a single surface
 *    maxes out at ~49° deviation at n=1.52, short of the ~67° key.
 *  - The exit surface normal (`Nb = vec3(N.xy, -N.z)`) is an approximation,
 *    not the true interior-path normal, which is *why* TIR can fire on it
 *    in `rodPath` even though true incidence on a symmetric chord never
 *    reaches the critical angle. That approximation TIR is not treated as
 *    the light-piping mechanism; `uPipe` is the explicit, primary one.
 */

export const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// --- Wavelength -> RGB, baked at shader-source-build time (TypeScript, not
// GLSL) so the dispersion loop costs zero runtime spectral math. Standard
// public-domain-style piecewise approximation (Bruton 1996) — sufficient
// for an art-directed spectrum, not colorimetric accuracy.
function wavelengthToRgb(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }
  let factor = 1;
  if (nm >= 380 && nm < 420) factor = 0.3 + (0.7 * (nm - 380)) / (420 - 380);
  else if (nm > 645 && nm <= 780) factor = 0.3 + (0.7 * (780 - nm)) / (780 - 645);
  return [r * factor, g * factor, b * factor];
}

/**
 * Samples spaced evenly in 1/λ² (the Cauchy shape), from 700nm (red, K=0,
 * pairs with the low-IOR `Tlo` ray) to 400nm (violet, K=1, pairs with the
 * high-IOR `Thi` ray). This bunches samples toward blue without solving for
 * literal Cauchy A/B — K *is* already the IOR mix fraction by construction,
 * so spacing wavelengths this way is what gives blue its tighter, more
 * separated fringe and red its broader one, matching the reference.
 *
 * Per-channel normalized so sum(W) ≈ (1,1,1): a white key light with
 * dispersion=0 (all K collapse toward the same direction) reproduces the
 * correct un-dispersed brightness regardless of sample count.
 */
function bakeSpectrum(samples: number): { k: number[]; w: [number, number, number][] } {
  const invSqRed = 1 / (700 * 700);
  const invSqBlue = 1 / (400 * 400);
  const k: number[] = [];
  const rgb: [number, number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const u = samples > 1 ? i / (samples - 1) : 0;
    const invSq = invSqRed + (invSqBlue - invSqRed) * u;
    const nm = 1 / Math.sqrt(invSq);
    k.push(u);
    rgb.push(wavelengthToRgb(nm));
  }
  const sum: [number, number, number] = [0, 0, 0];
  for (const c of rgb) {
    sum[0] += c[0];
    sum[1] += c[1];
    sum[2] += c[2];
  }
  const w = rgb.map(
    ([r, g, b]) =>
      [sum[0] > 1e-4 ? r / sum[0] : 0, sum[1] > 1e-4 ? g / sum[1] : 0, sum[2] > 1e-4 ? b / sum[2] : 0] as [
        number,
        number,
        number,
      ],
  );
  return { k, w };
}

function f(n: number): string {
  return Number.isFinite(n) ? n.toFixed(6) : "0.0";
}

const SHARED_UNIFORMS = /* glsl */ `
uniform sampler2D uTube;
uniform float uAspect;
uniform float uRadiusPx;
uniform float uRadiusScale;
uniform float uAaRange;

uniform float uIor;
uniform float uDispersion;
uniform float uF0;
uniform float uFresnelPower;
uniform float uAbsorb;
uniform float uReflGain;
uniform float uTransGain;
uniform float uPipe;
uniform float uSpreadFalloff;

uniform float uKeyElev;
uniform float uKeyWidth;
uniform float uKeyGain;
uniform float uKeyAzWidth;
uniform float uKeyDirectional;
uniform float uRimElev;
uniform float uRimWidth;
uniform float uRimGain;
uniform float uAmbGain;

uniform float uEnvCosYaw;
uniform float uEnvSinYaw;
uniform float uEnvCosPitch;
uniform float uEnvSinPitch;
uniform vec2  uPointer;
uniform float uPerspective;
uniform float uParallax;

uniform float uExposure;
uniform float uDebug;

varying vec2 vUv;

const vec3 KEY_COLOR = vec3(1.0, 0.97, 0.90);
const vec3 RIM_COLOR = vec3(0.55, 0.65, 0.85);
const vec3 AMB_COLOR = vec3(0.35, 0.42, 0.55);
const vec3 ABSORB_COLOR = vec3(1.0, 0.90, 0.75);
const vec2 KEY_AZ_DIR = vec2(0.0, 1.0);

float pulse(float x) {
  float a = 1.0 - min(abs(x), 1.0);
  return a * a * (3.0 - 2.0 * a);
}

vec3 rotEnv(vec3 d) {
  vec3 dy = vec3(uEnvCosYaw * d.x + uEnvSinYaw * d.z, d.y, -uEnvSinYaw * d.x + uEnvCosYaw * d.z);
  return vec3(dy.x, uEnvCosPitch * dy.y - uEnvSinPitch * dy.z, uEnvSinPitch * dy.y + uEnvCosPitch * dy.z);
}

vec3 env(vec3 dRaw) {
  vec3 d = rotEnv(dRaw);
  float key = pulse((d.y - uKeyElev) / uKeyWidth);
  vec2 azv = d.xz;
  float azLen = length(azv);
  float az = azLen > 1e-5 ? pulse((dot(azv / azLen, KEY_AZ_DIR) - 1.0) / uKeyAzWidth) : 0.0;
  key *= mix(1.0, az, uKeyDirectional);
  float rim = pulse((d.y - uRimElev) / uRimWidth);
  float amb = 0.5 + 0.5 * d.y;
  return KEY_COLOR * (key * uKeyGain) + RIM_COLOR * (rim * uRimGain) + AMB_COLOR * (amb * uAmbGain);
}

float fresnel(float cosT) {
  return uF0 + (1.0 - uF0) * pow(1.0 - clamp(cosT, 0.0, 1.0), uFresnelPower);
}

// Two-surface path through the rod (enter top, exit bottom). The exit
// normal is an approximation (see file header) — its TIR branch exists so
// the shader never produces a degenerate direction, not as the intended
// light-piping mechanism.
vec3 rodPath(vec3 V, vec3 N, float ior) {
  vec3 Nb = vec3(N.xy, -N.z);
  vec3 I1 = -V;
  vec3 T1 = refract(I1, N, 1.0 / ior);
  if (dot(T1, T1) < 0.5) return reflect(I1, N);
  vec3 T2 = refract(T1, -Nb, ior);
  if (dot(T2, T2) < 0.5) return reflect(T1, Nb);
  return T2;
}
`;

/**
 * Builds the full scene fragment shader, source-generated because GLSL ES
 * 1.00 has no array constructors — the wavelength loop is unrolled by
 * string concatenation instead. `samples` is the only tuning field that
 * requires a `Program` rebuild rather than a uniform update (see
 * `glass-tuning.ts`).
 */
export function buildGlassFragment(samples: number): string {
  const n = Math.max(2, Math.min(16, Math.round(samples)));
  const { k, w } = bakeSpectrum(n);

  // Each wavelength sample gets its OWN t -> N -> Fresnel -> reflect/refract
  // pass, not just its own transmission direction. Earlier version swept only
  // the transmission ray across two IORs while reflection stayed a single
  // achromatic sample — but Fresnel saturates to ~1 within ~1% of the
  // silhouette (verified: F=0.5 at t≈0.01 for F0=0.043, power=5), i.e.
  // reflection dominates exactly at the rim, and that's an average of ONE
  // colorless direction. The dispersion spread was also gated toward zero at
  // high t (deliberately, to keep the core neutral) — so the two effects
  // never overlapped and no color survived. Perturbing t itself per sample
  // (a standard chromatic-aberration technique: each wavelength "sees" a
  // slightly different effective radius) moves the Fresnel transition,
  // reflection direction, AND transmission direction together per sample,
  // so the fringing shows up right at the highlight edge — where the
  // reference actually has it.
  const dispersionLines = k
    .map((ki, i) => {
      const [r, g, b] = w[i];
      return `  {
    float ti = clamp(t + ${f(ki - 0.5)} * uDispersion, 0.0, 1.0);
    ti = max(ti, tFloor);
    float hi = sqrt(max(2.0 * ti - ti * ti, 0.0));
    vec3 Ni = vec3(-g * (1.0 - ti), hi);
    float cosTi = max(dot(Ni, V), 0.0);
    float Fi = fresnel(cosTi);
    vec3 reflI = env(reflect(-V, Ni)) * uReflGain;
    vec3 transI = rodPath(V, Ni, uIor);
    vec3 absorbI = exp(-uAbsorb * ABSORB_COLOR * 2.0 * hi);
    vec3 sampleCol = mix(env(transI) * absorbI * uTransGain, reflI, Fi);
    col += sampleCol * vec3(${f(r)}, ${f(g)}, ${f(b)});
  }`;
    })
    .join("\n");

  return /* glsl */ `
precision highp float;
${SHARED_UNIFORMS}

void main() {
  // The glyph texture is uploaded with flipY:false (pinned deliberately —
  // UNPACK_FLIP_Y_WEBGL behaviour on ArrayBufferView sources is not
  // consistent across implementations), and the fullscreen Triangle's uv=0
  // sits at the bottom of NDC — so the row order needs correcting here,
  // once, rather than trusting the upload path to do it.
  vec4 s = texture2D(uTube, vec2(vUv.x, 1.0 - vUv.y));
  float cov = clamp((s.a - 0.5) * uAaRange + 0.5, 0.0, 1.0);
  if (cov <= 0.002) { gl_FragColor = vec4(0.0); return; }

  float radiusScale = max(uRadiusScale, 0.001);
  float tFloor = 0.5 / max(uRadiusPx * radiusScale, 1.0);
  float t = clamp(max(s.b, 0.0) / radiusScale, 0.0, 1.0);
  t = max(t, tFloor);
  float h = sqrt(max(2.0 * t - t * t, 0.0));

  vec2 g = s.rg * 2.0 - 1.0;
  float glen = length(g);
  g = glen > 1e-4 ? g / glen : vec2(0.0, 1.0);
  vec3 N = vec3(-g * (1.0 - t), h);

  vec2 sp2 = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec3 V = normalize(vec3(sp2 * uPerspective + (uPointer - 0.5) * uParallax, 1.0));

  float cosT = max(dot(N, V), 0.0);
  float F = fresnel(cosT);

  // Per-wavelength reflect/refract, unrolled below — see buildGlassFragment's
  // comment on why dispersion is modelled as a per-sample perturbation of t
  // (moving the Fresnel transition itself) rather than sweeping IOR on the
  // transmission ray alone.
  vec3 col = vec3(0.0);
${dispersionLines}

  // Explicit light-piping term — see rodPath's comment on why exit TIR
  // can't be relied on. Mirrors the normal laterally so a second, dimmer
  // highlight appears on the far side of the stroke.
  vec3 Np = vec3(-N.xy, N.z);
  col += env(reflect(-V, Np)) * (1.0 - F) * uPipe * h;

  col *= uExposure;

  if (uDebug > 5.5) {
    gl_FragColor = vec4(vec3(cov), 1.0);
  } else if (uDebug > 4.5) {
    gl_FragColor = vec4(vec3(F), 1.0);
  } else if (uDebug > 3.5) {
    gl_FragColor = vec4(vec3(h), 1.0);
  } else if (uDebug > 2.5) {
    gl_FragColor = vec4(vec3(t), 1.0);
  } else if (uDebug > 1.5) {
    gl_FragColor = vec4(N * 0.5 + 0.5, 1.0);
  } else if (uDebug > 0.5) {
    gl_FragColor = vec4(g * 0.5 + 0.5, 0.5, 1.0);
  } else {
    gl_FragColor = vec4(max(col, 0.0), cov);
  }
}
`;
}

// --- Post chain: bright-pass+downsample, separable blur, final composite.
// Hand-rolled rather than ogl's `extras/Post` because Post is single-
// resolution ping-pong and can't do a mip chain; the reference's wide,
// coloured bloom needs one.

export const FULLSCREEN_VERT = VERT;

/**
 * Inert placeholder for `meshes.scene` before the real glass Program exists
 * (built async, once `samples` and the SDF texture are known — see
 * `wordmark-glass.tsx`'s effect B). Deliberately has NO sampler uniforms
 * pointing at any render target: an earlier version reused `brightProgram`
 * as this placeholder, whose `uSource` already pointed at `targets.scene`
 * — so for one frame, the scene pass sampled the exact texture it was
 * rendering into (`GL_INVALID_OPERATION: Feedback loop formed between
 * Framebuffer and active Texture`). This can't do that.
 */
export const PLACEHOLDER_FRAG = /* glsl */ `
precision mediump float;
void main() {
  gl_FragColor = vec4(0.0);
}
`;

/** Reads `uSource` at full res, box-downsamples 2x2, applies a soft-knee threshold. Writes a half-res (or smaller) target. */
export const BRIGHTPASS_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

void main() {
  vec3 c = (
    texture2D(uSource, vUv + uSourceTexel * vec2(-0.5, -0.5)).rgb +
    texture2D(uSource, vUv + uSourceTexel * vec2( 0.5, -0.5)).rgb +
    texture2D(uSource, vUv + uSourceTexel * vec2(-0.5,  0.5)).rgb +
    texture2D(uSource, vUv + uSourceTexel * vec2( 0.5,  0.5)).rgb
  ) * 0.25;

  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(lum - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contribution = max(max(lum - uThreshold, soft), 0.0);
  c *= contribution / max(lum, 1e-4);

  gl_FragColor = vec4(c, 1.0);
}
`;

/** Downsamples `uSource` 2x2 with no threshold — used to feed the next (smaller) blur level from the previous level's already-blurred result. */
export const DOWNSAMPLE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
varying vec2 vUv;

void main() {
  vec3 c = (
    texture2D(uSource, vUv + uSourceTexel * vec2(-0.5, -0.5)).rgb +
    texture2D(uSource, vUv + uSourceTexel * vec2( 0.5, -0.5)).rgb +
    texture2D(uSource, vUv + uSourceTexel * vec2(-0.5,  0.5)).rgb +
    texture2D(uSource, vUv + uSourceTexel * vec2( 0.5,  0.5)).rgb
  ) * 0.25;
  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * Separable 9-tap Gaussian via the linear-sampling trick (5 fetches): pairs
 * of adjacent taps are combined into one bilinear sample at a weighted
 * offset. `uDirection` is (1,0) for the horizontal pass, (0,1) for vertical.
 */
export const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
uniform vec2 uDirection;
varying vec2 vUv;

void main() {
  // Weights/offsets for a 9-tap Gaussian (sigma ~2), pre-combined into 5 bilinear taps.
  vec2 off1 = uDirection * uSourceTexel * 1.411764705882353;
  vec2 off2 = uDirection * uSourceTexel * 3.294117647058824;
  vec3 c = texture2D(uSource, vUv).rgb * 0.1964825501511404;
  c += texture2D(uSource, vUv + off1).rgb * 0.2969069646728344;
  c += texture2D(uSource, vUv - off1).rgb * 0.2969069646728344;
  c += texture2D(uSource, vUv + off2).rgb * 0.09447039785044732;
  c += texture2D(uSource, vUv - off2).rgb * 0.09447039785044732;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Sums the scene + three bloom levels, ACES-tonemaps, dithers, and derives canvas alpha from coverage and composited luminance. */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;
uniform float uBloomGain1;
uniform float uBloomGain2;
uniform float uBloomGain3;
uniform float uAlphaGain;
uniform float uPreExposure;
uniform float uHdr; // 1.0 if the scene target is float (already true HDR), 0.0 if LDR (needs uPreExposure undone)
uniform float uDebugBloom;
varying vec2 vUv;

vec3 aces(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 scene = texture2D(uScene, vUv);
  vec3 sceneRgb = mix(scene.rgb, scene.rgb * uPreExposure, 1.0 - uHdr);

  vec3 bloom =
    texture2D(uBloom1, vUv).rgb * uBloomGain1 +
    texture2D(uBloom2, vUv).rgb * uBloomGain2 +
    texture2D(uBloom3, vUv).rgb * uBloomGain3;
  bloom = mix(bloom, bloom * uPreExposure, 1.0 - uHdr);

  if (uDebugBloom > 0.5) {
    float a = clamp(dot(bloom, vec3(0.333)) * uAlphaGain, 0.0, 1.0);
    gl_FragColor = vec4(bloom, a);
    return;
  }

  vec3 hdr = sceneRgb + bloom;
  vec3 mapped = aces(hdr);
  mapped += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  float lum = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  float alpha = clamp(max(scene.a, lum * uAlphaGain), 0.0, 1.0);

  gl_FragColor = vec4(clamp(mapped, 0.0, 1.0), alpha);
}
`;
