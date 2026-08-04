/**
 * Shared types for the glyph signed-distance-field pipeline that feeds the
 * dispersive-glass wordmark (`WordmarkGlass`). Kept dependency-free so this
 * module can be imported by both the main thread and the SDF worker.
 */

/** What the rasterizer hands to the distance-transform stage. */
export interface RasterResult {
  /** width * height, 0..255 coverage from the 2D canvas fill. */
  alpha: Uint8ClampedArray;
  /** Device px, includes padding on all sides. */
  width: number;
  height: number;
  /** Device px, one edge — the bloom/dispersion clearance around the ink. */
  padDevice: number;
  /** CSS px — used to size and position the host + canvas in layout. */
  padCss: number;
  /** CSS px — the ink bounding box, for aligning against <Wordmark>. */
  inkWidthCss: number;
  inkHeightCss: number;
  /** Device px — the resolved font-size actually drawn with. */
  fontSizeDevice: number;
  /** Supersample factor already applied by the rasterizer (1 or 2). */
  supersample: number;
}

/** What the distance-transform stage produces, pre-packing. */
export interface DistanceField {
  /** width * height signed distance in *output* px (post-downsample), +inside. */
  signed: Float32Array;
  width: number;
  height: number;
}

/** Radius diagnostics — surfaced in the lab so a >20% split is visible. */
export interface RadiusEstimate {
  /** Chosen half-stroke-width in output px, after clamping. */
  radius: number;
  /** w = 2 * mean(d | d > 0) — unbiased for a monoline strip. */
  radiusMean: number;
  /** w = area / perimeter — independent cross-check. */
  radiusAreaPerim: number;
}

/** The final packed texture handed to WebGL, plus everything needed to size it. */
export interface GlyphField {
  /** RGBA8, width * height * 4. R,G = packed unit ∇d; B = t; A = coverage. */
  texture: Uint8Array;
  width: number;
  height: number;
  padDevice: number;
  padCss: number;
  inkWidthCss: number;
  inkHeightCss: number;
  /** Device px, in the *output* (post-downsample) resolution. */
  radiusPx: number;
  radiusMean: number;
  radiusAreaPerim: number;
  /** Device px used for the coverage channel's AA range (see distance-transform.ts). */
  aaRange: number;
  /** How long the SDF build took, ms — surfaced in the lab readout. */
  buildMs: number;
}

/**
 * Main-thread -> worker. `alpha` is transferred, not copied.
 *
 * `requestId` matters because the worker is a module-level singleton shared
 * across every `useGlyphField` caller (the hero WordmarkGlass, the lab page,
 * any future instance) — without it, a shared `onmessage` handler has no way
 * to route a response back to the build that asked for it, and concurrent
 * builds would cross-deliver.
 */
export interface SdfRequest {
  requestId: number;
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  padDevice: number;
  padCss: number;
  inkWidthCss: number;
  inkHeightCss: number;
  supersample: number;
  fontSizeDevice: number;
}

/** worker -> main thread. `texture` is transferred, not copied. Echoes `requestId`. */
export interface SdfResponse {
  requestId: number;
  texture: Uint8Array;
  width: number;
  height: number;
  padDevice: number;
  padCss: number;
  inkWidthCss: number;
  inkHeightCss: number;
  radiusPx: number;
  radiusMean: number;
  radiusAreaPerim: number;
  aaRange: number;
  buildMs: number;
}
