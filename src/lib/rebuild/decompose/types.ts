import type { TracedPath } from "../trace";

export type ElementKind = "shape" | "text" | "image" | "gradient" | "effect";

export interface GradientStop {
  offset: number; // 0-1
  color: string; // hex
}

export interface GradientDescriptor {
  kind: "linear" | "radial";
  /** Degrees, CSS convention (0 = left->right in a linear-gradient()). */
  angle: number;
  stops: GradientStop[];
  /** Radial only, working-image pixel space. */
  center?: { x: number; y: number };
  radius?: number;
}

export interface DesignElement {
  id: string;
  kind: ElementKind;
  /** x, y, w, h — working-image pixel space (see trace/index.ts's module comment). Projected to source space once, at pipeline persistence time. */
  bbox: [number, number, number, number];
  /** Indices into the shared TracedPath[] this element owns. */
  pathIndices: number[];
  fill: string;
  gradient?: GradientDescriptor;
  /** Named primitive for shape elements — "Rectangle", "Circle", etc. Absent means an unclassified blob/complex path. */
  primitive?: string;
  parentId: string | null;
  zIndex: number;
  confidence: number;
  /** Named sub-scores that multiplied into `confidence` — kept for the evidence UI ("lost 20% because stroke widths varied"). */
  confidenceParts: Record<string, number>;
  /** Deterministic default name from the primitive/kind, before any naming pass overwrites it. */
  name: string;
  /** Set when the whole image collapsed to a single full-canvas image element (film grain, a photographic poster). */
  degenerate?: "photographic";
  /** A shape whose edge measured meaningfully softer than the image's median — reported as a fact, not upgraded to a shadow inference unless effect.ts's stricter gate also passes. */
  softEdge?: boolean;
}

/** Per-path features computed once in precompute.ts and read by every later stage — avoids re-rasterizing Bezier segments per stage. */
export interface PathFeatures {
  /** Net-of-holes filled pixel count, from the ownership raster (not the raw shoelace `area`, which ignores holes). */
  netArea: number;
  /** netArea / (bbox.w * bbox.h). */
  extent: number;
  /** Arc-length perimeter approximation. */
  perimeter: number;
  /** netArea / canvasArea. */
  areaFrac: number;
  /** width / height of bbox. */
  aspect: number;
  /** 4*pi*netArea / perimeter^2 — 1.0 for a perfect circle. */
  compactness: number;
  /** Fraction of segments that are quadratic (curved) vs. straight. */
  qFrac: number;
  /** 2*netArea/perimeter — exact for a long bar of width t. */
  strokeWidth: number;
}

export interface Corner {
  /** Index into the path's `points` polyline. */
  index: number;
  /** Absolute turning angle in degrees. */
  angle: number;
}

/** Shared working state threaded through every decompose stage. */
export interface DecomposeContext {
  paths: TracedPath[];
  width: number;
  height: number;
  canvasArea: number;
  gray: Uint8ClampedArray;
  rgb: Uint8ClampedArray;
  /** Per-PIXEL raster (y*width+x): index into `paths` of the owning candidate (non-hole) path, or -1. Built once in precompute, read-only after. */
  pixelOwner: Int32Array;
  /** Candidate (non-hole) path indices — the only paths any stage may claim. */
  candidates: number[];
  features: Map<number, PathFeatures>;
  corners: Map<number, Corner[]>;
  /** Symmetric shared-boundary pixel counts between candidate path indices, sparse: adjacency.get(a)?.get(b). */
  adjacency: Map<number, Map<number, number>>;
  relaxedTextBoxes: Array<[number, number, number, number]>;
  /**
   * The ownership LEDGER (not the pixel raster above): one flag per path
   * index, 0 = unclaimed, 1 = claimed by some already-formed element. Every
   * stage may only build elements from unclaimed candidates and must set
   * this the moment it commits — the entire cross-stage conflict-resolution
   * rule is "claim only what's still 0, in stage order, no backtracking."
   */
  claimed: Uint8Array;
}
