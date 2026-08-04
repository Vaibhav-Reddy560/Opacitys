/**
 * Every tunable knob for the dispersive-glass wordmark, in one place, so the
 * lab page (`/lab/wordmark`) can generate its sliders from `TUNING_SCHEMA`
 * rather than hand-writing one input per uniform. Values and ranges are the
 * starting points derived (and numerically verified) in the plan — expect
 * to move `key*` first, since that's what decides whether the effect lands
 * at all (see the plan's R1 risk entry).
 */

export interface GlassTuning {
  // --- Geometry -------------------------------------------------------
  /** Multiplies the SDF-derived half-stroke-width. The estimator is unbiased in theory but a real font + rasterizer adds a small constant bias; this absorbs it. */
  radiusScale: number;

  // --- Glass material ---------------------------------------------------
  /** Base index of refraction (Cauchy-shaped dispersion is centred here). */
  ior: number;
  /** Total spread of IOR across the visible spectrum (n_blue - n_red). Real glass is ~0.007; this is deliberately cranked, same posture as the reference render. */
  dispersion: number;
  /** Fresnel reflectance at normal incidence. */
  f0: number;
  /** Fresnel falloff exponent — lower widens the rim past the physical value of 5. */
  fresnelPower: number;
  /** Beer-Lambert absorption strength along the transmitted chord. */
  absorb: number;
  /** Reflection term gain (the blown silhouette). */
  reflGain: number;
  /** Transmission term gain (the chromatic band + core). */
  transGain: number;
  /** Explicit far-side "light piping" term — the true two-surface path can't produce this via TIR (incidence never reaches the critical angle on a symmetric chord), so it's modelled directly. */
  pipe: number;
  /** Gates how far the K[] wavelength lerp spreads by (1-h)^this — keeps the core neutral, confines rainbow to the rim. */
  spreadFalloff: number;
  /** Wavelength samples for the dispersion loop. Changing this rebuilds the fragment shader (unlike every other field, which is a plain uniform update). */
  samples: number;

  // --- Environment (the studio the glass reflects/refracts) -------------
  /** Key light elevation, d.y in [-1,1]. Where the bright band sits — tune this first. */
  keyElev: number;
  /** Key light angular width (gaussian-ish sigma in d.y). Narrower = crisper band. */
  keyWidth: number;
  /** Key light gain — must exceed 1.0 (HDR) or bloom has nothing to threshold. */
  keyGain: number;
  /** Azimuthal width of the key — 0 = full ring, larger = a rectangle, breaking the band into arcs around curves like the reference. */
  keyAzWidth: number;
  /** Blend between ring (0) and directional rectangle (1) for the key. */
  keyDirectional: number;
  /** Rim light elevation — dim fill so the underside doesn't go fully dead. */
  rimElev: number;
  rimWidth: number;
  rimGain: number;
  /** Ambient floor so the core never hits literal zero. */
  ambGain: number;

  // --- Interaction --------------------------------------------------
  /** Max yaw rotation of the environment sample direction, radians, driven by cursor x. */
  yawRange: number;
  /** Max pitch rotation, radians, driven by cursor y. */
  pitchRange: number;
  /** View-direction shear from screen position — makes the ends of the word catch light differently. */
  perspective: number;
  /** View-direction shear from cursor position. */
  parallax: number;
  /** Per-frame lerp rate toward the pointer target (matches prismatic-chrome.tsx's constant). */
  smoothing: number;
  /** Autonomous drift speed when idle. Default 0 — the wordmark is purely cursor-driven so a settled pointer costs zero GPU (see WordmarkGlass's idle-freeze). */
  driftSpeed: number;

  // --- Post: bloom + tonemap --------------------------------------------
  threshold: number;
  knee: number;
  bloomGain1: number;
  bloomGain2: number;
  bloomGain3: number;
  /** Divides the HDR colour before an LDR (RGBA8) render target, multiplied back in the bright pass. Unused on the RGBA16F path. */
  preExposure: number;
  exposure: number;

  // --- Alignment (lab only) ----------------------------------------------
  /** Device-px nudge against the SVG wordmark / reference overlay, to absorb measureText vs. getBBox disagreement. */
  alignNudgeX: number;
  alignNudgeY: number;
}

/**
 * Tuned live in `/lab/wordmark` against the user's reference render (see the
 * plan file for the optical derivation). Two values differ from the plan's
 * initial estimates for reasons discovered only by actually looking at it:
 *
 * - `fresnelPower` 5.0 -> 3.0 and `keyElev`/`keyWidth` 0.92/0.055 -> 0.80/0.10:
 *   the reflected-key band was landing too high and too narrow to read at
 *   this font's actual stroke radius (~11px at the lab's preview size).
 * - Reflection and transmission are no longer evaluated as one achromatic
 *   sample plus a separately-swept transmission ray. Fresnel saturates to
 *   ~1 within ~1% of the silhouette (verified), so with the original
 *   two-ray model reflection alone — a single colourless direction — owned
 *   exactly the pixels where the highlight is, and dispersion (gated toward
 *   zero at high t by design) never overlapped it: no visible colour at any
 *   dispersion value, including the schema's max. `buildGlassFragment` now
 *   perturbs `t` per wavelength sample (moving the Fresnel transition,
 *   reflection direction, and transmission direction together), which is
 *   what actually produces the fringing at the highlight edge — see that
 *   function's comment for the full derivation.
 */
export const DEFAULT_TUNING: GlassTuning = {
  radiusScale: 1.0,

  ior: 1.52,
  dispersion: 0.22,
  f0: 0.045,
  fresnelPower: 3.0,
  absorb: 1.2,
  reflGain: 1.0,
  transGain: 1.0,
  pipe: 0.36,
  spreadFalloff: 2.5,
  samples: 8,

  keyElev: 0.8,
  keyWidth: 0.1,
  keyGain: 24.0,
  keyAzWidth: 0.55,
  keyDirectional: 0.6,
  rimElev: -0.45,
  rimWidth: 0.3,
  rimGain: 2.4,
  ambGain: 0.05,

  yawRange: 0.85,
  pitchRange: 0.4,
  perspective: 0.1,
  parallax: 0.14,
  smoothing: 0.045,
  driftSpeed: 0,

  threshold: 1.0,
  knee: 0.5,
  bloomGain1: 0.9,
  bloomGain2: 0.5,
  bloomGain3: 0.28,
  preExposure: 8,
  exposure: 1.06,

  alignNudgeX: 0,
  alignNudgeY: 0,
};

export type TuningGroup = "Geometry" | "Glass" | "Environment" | "Interaction" | "Post" | "Align";

export interface TuningField {
  key: keyof GlassTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  group: TuningGroup;
  /** Changing this field rebuilds the GL Program instead of just updating a uniform. */
  rebuildsProgram?: boolean;
}

export const TUNING_SCHEMA: TuningField[] = [
  { key: "radiusScale", label: "Radius scale", min: 0.55, max: 1.6, step: 0.01, group: "Geometry" },

  { key: "ior", label: "IOR", min: 1.3, max: 2.1, step: 0.01, group: "Glass" },
  { key: "dispersion", label: "Dispersion spread", min: 0, max: 0.3, step: 0.005, group: "Glass" },
  { key: "f0", label: "Fresnel F0", min: 0.02, max: 0.3, step: 0.005, group: "Glass" },
  { key: "fresnelPower", label: "Fresnel power", min: 1.5, max: 5, step: 0.05, group: "Glass" },
  { key: "absorb", label: "Absorption", min: 0, max: 4, step: 0.05, group: "Glass" },
  { key: "reflGain", label: "Reflection gain", min: 0.2, max: 2.5, step: 0.02, group: "Glass" },
  { key: "transGain", label: "Transmission gain", min: 0.2, max: 2.5, step: 0.02, group: "Glass" },
  { key: "pipe", label: "Light piping", min: 0, max: 1.5, step: 0.02, group: "Glass" },
  { key: "spreadFalloff", label: "Spread falloff", min: 0.5, max: 6, step: 0.1, group: "Glass" },
  { key: "samples", label: "Wavelength samples", min: 4, max: 16, step: 1, group: "Glass", rebuildsProgram: true },

  { key: "keyElev", label: "Key elevation", min: 0.2, max: 1.0, step: 0.005, group: "Environment" },
  { key: "keyWidth", label: "Key width", min: 0.02, max: 0.25, step: 0.002, group: "Environment" },
  { key: "keyGain", label: "Key gain (HDR)", min: 1, max: 60, step: 0.5, group: "Environment" },
  { key: "keyAzWidth", label: "Key azimuth width", min: 0.1, max: 1.5, step: 0.01, group: "Environment" },
  { key: "keyDirectional", label: "Key directionality", min: 0, max: 1, step: 0.01, group: "Environment" },
  { key: "rimElev", label: "Rim elevation", min: -1, max: 0.2, step: 0.01, group: "Environment" },
  { key: "rimWidth", label: "Rim width", min: 0.05, max: 0.8, step: 0.01, group: "Environment" },
  { key: "rimGain", label: "Rim gain", min: 0, max: 10, step: 0.1, group: "Environment" },
  { key: "ambGain", label: "Ambient gain", min: 0, max: 0.3, step: 0.005, group: "Environment" },

  { key: "yawRange", label: "Yaw range (rad)", min: 0, max: 1.57, step: 0.01, group: "Interaction" },
  { key: "pitchRange", label: "Pitch range (rad)", min: 0, max: 1.2, step: 0.01, group: "Interaction" },
  { key: "perspective", label: "Perspective shear", min: 0, max: 0.4, step: 0.005, group: "Interaction" },
  { key: "parallax", label: "Parallax shear", min: 0, max: 0.5, step: 0.005, group: "Interaction" },
  { key: "smoothing", label: "Pointer smoothing", min: 0.01, max: 0.3, step: 0.005, group: "Interaction" },
  { key: "driftSpeed", label: "Idle drift speed", min: 0, max: 0.5, step: 0.01, group: "Interaction" },

  { key: "threshold", label: "Bloom threshold", min: 0, max: 3, step: 0.02, group: "Post" },
  { key: "knee", label: "Bloom knee", min: 0.01, max: 1.5, step: 0.01, group: "Post" },
  { key: "bloomGain1", label: "Bloom gain 1/2", min: 0, max: 3, step: 0.02, group: "Post" },
  { key: "bloomGain2", label: "Bloom gain 1/4", min: 0, max: 3, step: 0.02, group: "Post" },
  { key: "bloomGain3", label: "Bloom gain 1/8", min: 0, max: 3, step: 0.02, group: "Post" },
  { key: "preExposure", label: "Pre-exposure (LDR only)", min: 1, max: 20, step: 0.5, group: "Post" },
  { key: "exposure", label: "Exposure", min: 0.1, max: 4, step: 0.02, group: "Post" },

  { key: "alignNudgeX", label: "Align nudge X (px)", min: -20, max: 20, step: 0.5, group: "Align" },
  { key: "alignNudgeY", label: "Align nudge Y (px)", min: -20, max: 20, step: 0.5, group: "Align" },
];

export function cloneTuning(base: GlassTuning, overrides?: Partial<GlassTuning>): GlassTuning {
  return overrides ? { ...base, ...overrides } : { ...base };
}
