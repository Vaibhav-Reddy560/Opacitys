"""Balance analyzer: visual weight centroid versus the geometric canvas
center. Symmetric/centered designs can be intentional -- we only flag a
large, likely-unintentional offset.

Weight is |luminance - background luminance|, not gradient magnitude. Pure
edge/gradient weighting only registers the *boundary* of a filled shape and
misses a large solid block's interior almost entirely -- exactly the kind of
element that visually dominates a layout. Deviation-from-background is a
much closer proxy for "how much this pixel pulls the eye"."""

from __future__ import annotations

import cv2
import numpy as np

from models import Finding, Measured
from shared import TextRegion, new_id

EXPECTED_OFFSET_FRAC = (0.0, 0.2)  # offset / half-diagonal


def analyze(bgr: np.ndarray, _text_regions: list[TextRegion]) -> list[Finding]:
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float64)

    # Median is a robust estimate of the dominant background tone (most of a
    # poster/design's area is background, even a busy one).
    background = float(np.median(gray))
    weight = np.abs(gray - background)

    total = weight.sum()
    if total <= 0:
        return []

    ys, xs = np.indices(weight.shape)
    cx = float((xs * weight).sum() / total)
    cy = float((ys * weight).sum() / total)

    center_x, center_y = w / 2, h / 2
    offset = float(np.hypot(cx - center_x, cy - center_y))
    half_diag = float(np.hypot(w, h) / 2)
    offset_frac = offset / half_diag if half_diag > 0 else 0.0

    lo, hi = EXPECTED_OFFSET_FRAC
    if offset_frac <= hi:
        return []

    box_size = min(w, h) * 0.15
    bbox = (
        max(0.0, cx - box_size / 2),
        max(0.0, cy - box_size / 2),
        box_size,
        box_size,
    )

    return [
        Finding(
            id=new_id(),
            dimension="balance",
            severity="major" if offset_frac > hi * 1.5 else "minor",
            bbox=bbox,
            measured=Measured(value=round(offset_frac, 2), expected=(lo, hi), unit=" centroid offset"),
        )
    ]
