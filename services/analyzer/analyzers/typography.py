"""Typography analyzer: clusters OCR text-region heights into distinct type
sizes. A design with many ungoverned type sizes (no modular scale) is a
reliable amateur tell -- professional type systems typically use 3-5 sizes."""

from __future__ import annotations

import numpy as np

from models import Finding, Measured
from shared import TextRegion, new_id

EXPECTED_DISTINCT_SIZES = (2.0, 5.0)
CLUSTER_TOLERANCE_PX = 3  # heights within this many px are "the same size"


def _cluster_heights(heights: list[float]) -> list[float]:
    if not heights:
        return []
    sorted_h = sorted(heights)
    clusters: list[list[float]] = [[sorted_h[0]]]
    for h in sorted_h[1:]:
        if h - clusters[-1][-1] <= CLUSTER_TOLERANCE_PX:
            clusters[-1].append(h)
        else:
            clusters.append([h])
    return [float(np.mean(c)) for c in clusters]


def analyze(bgr: np.ndarray, text_regions: list[TextRegion]) -> list[Finding]:
    if len(text_regions) < 3:
        # Not enough text to say anything meaningful about a type scale.
        return []

    heights = [r.bbox[3] for r in text_regions]
    clusters = _cluster_heights(heights)
    n_sizes = len(clusters)

    lo, hi = EXPECTED_DISTINCT_SIZES
    if lo <= n_sizes <= hi:
        return []

    xs = [r.bbox[0] for r in text_regions]
    ys = [r.bbox[1] for r in text_regions]
    x2s = [r.bbox[0] + r.bbox[2] for r in text_regions]
    y2s = [r.bbox[1] + r.bbox[3] for r in text_regions]
    union_bbox = (min(xs), min(ys), max(x2s) - min(xs), max(y2s) - min(ys))

    severity = "major" if n_sizes > hi + 3 else "minor"
    return [
        Finding(
            id=new_id(),
            dimension="typography",
            severity=severity,
            bbox=union_bbox,
            measured=Measured(value=n_sizes, expected=EXPECTED_DISTINCT_SIZES, unit=" distinct sizes"),
        )
    ]
