/**
 * Every tunable threshold in the decompose pipeline, in one file, each with
 * a one-line justification — matching the style of
 * src/lib/measure/analyzers/restraint.ts. This is where a future tuning
 * pass happens; nothing below should be duplicated inline in a stage file.
 */

// ---------------------------------------------------------------------------
// Stage 0 — precompute (corner spectrum, shared by stage 4's primitive tests)
// ---------------------------------------------------------------------------

/** Arc-length-uniform resample count for the corner spectrum. */
export const CORNER_RESAMPLE_N = 128;
/** Non-max suppression window, in resampled-point units. */
export const CORNER_NMS_WINDOW = 8;
/** Turning angle noise floor — below this, it's boundary jitter, not a corner. */
export const CORNER_MIN_ANGLE = 15; // degrees

// ---------------------------------------------------------------------------
// Stage 1 — photographic regions
// ---------------------------------------------------------------------------

/** Grid cell side, working-image px — ~1000 cells on a 1600px-edge image. */
export const PHOTO_CELL_MIN = 16;
export const PHOTO_CELL_DIVISOR = 32;

/** Fragmentation: distinct owning paths in a cell. 4 = four flat elements meeting at a corner (legitimate); 16 = more fragments than the whole palette has colors. */
export const PHOTO_FRAG_LO = 4;
export const PHOTO_FRAG_HI = 16;

/** Flatness deficit: reuses restraint.ts's own flat-pixel test verbatim. */
export const PHOTO_FLAT_GRADIENT_MAX = 8;

/** Local entropy (32-bin, normalized by log2(32)): 0.25 = a two-tone cell with one AA edge; 0.70 = unambiguous continuous tone. */
export const PHOTO_ENTROPY_LO = 0.25;
export const PHOTO_ENTROPY_HI = 0.7;

/** Weights sum to 1; fragmentation is the signal specific to "this shattered the vectorizer". */
export const PHOTO_WEIGHT_FRAG = 0.4;
export const PHOTO_WEIGHT_FLAT = 0.3;
export const PHOTO_WEIGHT_ENTROPY = 0.3;

/** No single signal can declare a photo alone — even fragmentation=1.0 needs 0.5 more from the other two. */
export const PHOTO_CELL_SCORE_THRESHOLD = 0.55;

/** A cell this covered by a relaxed text-line box is vetoed from ever scoring as photo — dense body copy trips all three signals otherwise. */
export const PHOTO_TEXT_VETO_COVERAGE = 0.6;

/** Region formation: below this many cells / canvas share / min side, it's photographic texture inside an ornament, not a photo worth keeping raster. */
export const PHOTO_REGION_MIN_CELLS = 24;
export const PHOTO_REGION_MIN_CANVAS_FRAC = 0.015;
export const PHOTO_REGION_MIN_SIDE_CELLS = 6;

/** Rectangle-snap vs. masked-region vs. reject, by cell fill ratio. */
export const PHOTO_SNAP_RECT_FILL = 0.85;
export const PHOTO_KEEP_MASK_FILL = 0.6;

/** A path counts toward a photo region only if the MAJORITY of its pixels fall inside it — touching isn't enough. */
export const PHOTO_CLAIM_MAJORITY = 0.5;

/** If photo regions cover this much of the canvas, treat the whole image as one photograph rather than emitting fragments. */
export const PHOTO_DEGENERATE_COVERAGE = 0.85;

// ---------------------------------------------------------------------------
// Stage 2 — text grouping
// ---------------------------------------------------------------------------

/** Relaxed text-line box constraints (vs. text-lines.ts's shipped 0.15/0.6, tuned for critique's tighter body-copy assumption). A display headline routinely exceeds 15% of image height; a single wide character can be narrower than 0.6x its own height. */
export const TEXT_RELAXED_MAX_HEIGHT_FRAC = 0.35;
export const TEXT_RELAXED_MIN_WIDTH_RATIO = 0.35;

/** Paragraph grouping: consecutive lines merge into one parent when edges align, spacing is tight, and sizes match. */
export const TEXT_BLOCK_EDGE_TOLERANCE_FRAC = 0.02;
export const TEXT_BLOCK_MAX_GAP_RATIO = 1.6; // x median line height
export const TEXT_BLOCK_HEIGHT_RATIO_LO = 0.8;
export const TEXT_BLOCK_HEIGHT_RATIO_HI = 1.25;
export const TEXT_BLOCK_MIN_H_OVERLAP = 0.6;

/** A glyph candidate must have this much of its own area inside the line box — asymmetric on purpose, IoU is the wrong question for "is this glyph inside this line". */
export const TEXT_GLYPH_COVERAGE = 0.8;

/** Size gate: a glyph can't be much taller than its own (closed) line box, except on a 1-2 character line. */
export const TEXT_GLYPH_MAX_HEIGHT_RATIO = 1.35;
export const TEXT_GLYPH_MAX_AREA_SHARE = 0.5;
export const TEXT_GLYPH_SHORT_LINE_ASPECT = 2.2;

/** The genuine-small-shape guard: reject only when BOTH stroke width and area are outliers — a period is blobby but tiny (stays text); a 20px icon is blobby AND large (falls through to shape). */
export const TEXT_STROKE_OUTLIER_RATIO = 2.5;
export const TEXT_AREA_OUTLIER_RATIO = 3;

/** Color coherence — reuses restraint.ts's own COLOR_DISTANCE verbatim. */
export const TEXT_COLOR_DISTANCE = 60;

/** Anti-alias halo absorption: thin (<=1.5px), color-between-ink-and-background, and mostly bordering an already-claimed glyph. */
export const TEXT_HALO_MAX_STROKE = 1.5;
export const TEXT_HALO_MAX_COLOR_DIST_TO_AXIS = 12;
export const TEXT_HALO_MIN_SHARED_BOUNDARY = 0.5;

/** Below this claimed-area share of a candidate line box, drop the line rather than emit a barely-covered element. */
export const TEXT_MIN_LINE_COVERAGE = 0.3;

/** Touching-glyph fallback (a descender kissing a same-color shape): assign to the shape, penalize the text element's confidence. */
export const TEXT_TOUCHING_COVERAGE_LO = 0.15;
export const TEXT_TOUCHING_VERTICAL_OVERSHOOT = 2;
export const TEXT_TOUCHING_PENALTY = 0.15;

// ---------------------------------------------------------------------------
// Stage 3 — gradients
// ---------------------------------------------------------------------------

/** Only layers still mostly unclaimed after text are gradient candidates. */
export const GRADIENT_LAYER_UNCLAIMED_FRAC = 0.7;

/** Chain seeding: two layers must share a real border, not a corner touch. */
export const GRADIENT_SEED_MIN_SHARED_BOUNDARY_FRAC = 0.15;

/** A band under this canvas-area share is quantization noise, not a stop. */
export const GRADIENT_MIN_BAND_AREA_FRAC = 0.005;

/** Color collinearity (area-weighted RGB PCA): ratio test alone passes trivially on a tiny-variance cloud, hence the absolute residual floor too. */
export const GRADIENT_COLLINEARITY_RATIO = 0.9;
export const GRADIENT_COLLINEARITY_MAX_RESIDUAL = 18;

/** Monotonicity of color against position (Spearman |rho|) — exact for short chains, one inversion tolerated at K>5 for quantization noise. */
export const GRADIENT_MONOTONE_EXACT_MAX_K = 5;
export const GRADIENT_MONOTONE_MIN_RHO_LARGE_K = 0.9;

/** Band tiling along the fitted axis. */
export const GRADIENT_MAX_OVERLAP_RATIO = 0.35;
export const GRADIENT_MIN_PERP_EXTENT_RATIO = 0.7;
export const GRADIENT_MIN_DOMINANT_PATH_SHARE = 0.7;

/** Linear must lose by 15% before radial is called — the simpler model wins ties. */
export const GRADIENT_RADIAL_MARGIN = 0.85;
export const GRADIENT_RADIAL_INNER_MAX_ASPECT_DEV = 0.35;
export const GRADIENT_RADIAL_INNER_MIN_COMPACTNESS = 0.6;
export const GRADIENT_RADIAL_CENTER_OUTSIDE_SLACK = 0.25; // x bbox diagonal

/** Reject the gradient model entirely above this residual. */
export const GRADIENT_MAX_MODEL_RESIDUAL = 0.18;

/** Stop reduction: drop an interior stop predicted by its neighbours within this many RGB units. */
export const GRADIENT_STOP_MERGE_TOLERANCE = 6;

/** Flat-fill de-banding: collinear but total color extent below this is banding on a FLAT fill, not a gradient. */
export const GRADIENT_FLAT_BAND_MAX_EXTENT = 24;

// ---------------------------------------------------------------------------
// Stage 4 — shapes / primitives
// ---------------------------------------------------------------------------

/** Speck absorption — reuses text-lines.ts's own speck floor (0.00005 of canvas). */
export const SHAPE_SPECK_MAX_AREA_FRAC = 0.00005;
export const SHAPE_SPECK_MAX_COLOR_DIST = 30;

/** Icon-group clustering for many tiny same-mark paths (a multi-path logo). */
export const SHAPE_ICON_MAX_AREA_FRAC = 0.002;
export const SHAPE_ICON_LINKAGE_DIAGONAL_MULT = 1.0;
export const SHAPE_ICON_MAX_LAYERS = 2;
export const SHAPE_ICON_ASPECT_LO = 0.6;
export const SHAPE_ICON_ASPECT_HI = 1.7;

/** Rectangle: exact to a half-pixel on an axis-aligned marching-squares contour. */
export const SHAPE_RECT_MIN_EXTENT = 0.97;
export const SHAPE_RECT_MAX_QFRAC = 0.02;
export const SHAPE_RECT_CORNER_MIN_TURN = 60; // degrees
export const SHAPE_RECT_SQUARE_TOLERANCE = 0.02;

/** Rounded rectangle: radius solved exactly from area, not fitted. */
export const SHAPE_ROUNDED_MIN_EXTENT = 0.85;
export const SHAPE_ROUNDED_RADIUS_MAX_RATIO = 1.6;
export const SHAPE_PILL_MIN_RADIUS_RATIO = 0.49;

/** Circle: qFrac is load-bearing — a regular octagon measures compactness 0.948, so compactness alone would call it a circle. */
export const SHAPE_CIRCLE_MIN_COMPACTNESS = 0.93;
export const SHAPE_CIRCLE_MIN_QFRAC = 0.6;
export const SHAPE_CIRCLE_ASPECT_TOLERANCE = 0.06;
export const SHAPE_ELLIPSE_MIN_COMPACTNESS = 0.85;
export const SHAPE_ELLIPSE_AREA_TOLERANCE = 0.08;

/** Triangle: the 0.52 upper bound on extent is a theorem (max inscribed-triangle area in its own bbox is 1/2), not a tuned number. */
export const SHAPE_TRIANGLE_MIN_TURN = 40;
export const SHAPE_TRIANGLE_MAX_QFRAC = 0.05;
export const SHAPE_TRIANGLE_EXTENT_LO = 0.3;
export const SHAPE_TRIANGLE_EXTENT_HI = 0.52;

/** Regular polygon (5-8 sides). */
export const SHAPE_POLY_ANGLE_TOLERANCE = 12; // degrees
export const SHAPE_POLY_EDGE_TOLERANCE = 0.15;

/** Divider / rule. */
export const SHAPE_DIVIDER_MAX_THICKNESS = 4; // px
export const SHAPE_DIVIDER_MIN_ASPECT = 20;
export const SHAPE_DIVIDER_MIN_EXTENT = 0.9;

/** Ring / donut: concentricity tolerance as a fraction of radius. */
export const SHAPE_RING_CONCENTRIC_TOLERANCE = 0.1;

/** Blob fallback floor — below this compactness there's no primitive worth claiming. */
export const SHAPE_BLOB_MIN_COMPACTNESS = 0.5;

// ---------------------------------------------------------------------------
// Stage 5 — effects (drop shadows only)
// ---------------------------------------------------------------------------

export const EFFECT_CANDIDATE_MIN_CASTER_AREA_RATIO = 0.5;
export const EFFECT_PRUNE_MAX_BBOX_RATIO = 4;
export const EFFECT_PRUNE_MAX_OFFSET_FRAC = 0.25; // x min(canvas w,h)

/** Offset-silhouette IoU — not 0.9: blur dilates the shadow by its radius, costing IoU proportional to perimeter x radius. */
export const EFFECT_MIN_IOU = 0.6;

/** Luminance must drop at least this much relative to local background. */
export const EFFECT_MAX_LUMINANCE_RATIO = 0.8;
export const EFFECT_MAX_HUE_DELTA = 30; // degrees
export const EFFECT_ACHROMATIC_MAX_CHANNEL_SPREAD = 12;

/** Soft-edge test — self-calibrating ratio is primary (immune to resolution/JPEG); the absolute floor only guards against a degenerate all-hard-edges image. */
export const EFFECT_SOFTNESS_RATIO = 1.6;
export const EFFECT_SOFTNESS_FLOOR_PX = 2.0;

/** Shared boundary on the side facing the offset — "behind" test. */
export const EFFECT_MIN_BEHIND_BOUNDARY_FRAC = 0.4;

/** A false effect is destructive (a real shape vanishes); confidence is hard-capped accordingly. */
export const EFFECT_CONFIDENCE_CAP = 0.55;

// ---------------------------------------------------------------------------
// Stage 6 — hierarchy / z-index
// ---------------------------------------------------------------------------

/** Parent = smallest-area element containing >=90% of this element's pixels. */
export const ORDER_PARENT_MIN_CONTAINMENT = 0.9;

export const KIND_RANK: Record<string, number> = {
  gradient: 0,
  image: 1,
  shape: 2,
  effect: 2, // overridden to casterRank - 0.5 at assembly time
  text: 4,
};

// ---------------------------------------------------------------------------
// Stage 7 — confidence gate
// ---------------------------------------------------------------------------

/** Below this, an element is downgraded to a generic, unclaimed-kind shape rather than asserted as a kind we don't believe. */
export const CONFIDENCE_GATE_MIN = 0.5;
/** Above this, confidence is shown as a stated fact rather than hedged copy. */
export const CONFIDENCE_GATE_HIGH = 0.8;
