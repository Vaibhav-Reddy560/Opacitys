"""Layout analyzer: how many detected content blocks actually share an edge
(left/right/top/bottom) with another block, within tolerance. Low alignment
ratio is a concrete, measurable "things don't line up" signal."""

from __future__ import annotations

import cv2
import numpy as np

from models import Finding, Measured
from shared import TextRegion, detect_content_boxes, new_id

TOLERANCE_FRAC = 0.01  # edges within 1% of image width/height count as aligned
EXPECTED_ALIGNMENT_RATIO = (0.6, 1.0)


def _edges_aligned(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= tol


def analyze(bgr: np.ndarray, text_regions: list[TextRegion]) -> list[Finding]:
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    boxes = detect_content_boxes(gray)
    # Prefer OCR boxes when we have enough of them -- more reliable edges
    # than generic contour detection for text-heavy designs.
    if len(text_regions) >= 4:
        boxes = [tuple(int(v) for v in r.bbox) for r in text_regions]

    if len(boxes) < 3:
        return []

    tol_x = TOLERANCE_FRAC * w
    tol_y = TOLERANCE_FRAC * h

    aligned_count = 0
    for i, box in enumerate(boxes):
        x, y, bw, bh = box
        has_partner = False
        for j, other in enumerate(boxes):
            if i == j:
                continue
            ox, oy, ow, oh = other
            if (
                _edges_aligned(x, ox, tol_x)
                or _edges_aligned(x + bw, ox + ow, tol_x)
                or _edges_aligned(y, oy, tol_y)
            ):
                has_partner = True
                break
        if has_partner:
            aligned_count += 1

    ratio = aligned_count / len(boxes)
    lo, hi = EXPECTED_ALIGNMENT_RATIO
    if ratio >= lo:
        return []

    xs = [b[0] for b in boxes]
    ys = [b[1] for b in boxes]
    x2s = [b[0] + b[2] for b in boxes]
    y2s = [b[1] + b[3] for b in boxes]
    union_bbox = (min(xs), min(ys), max(x2s) - min(xs), max(y2s) - min(ys))

    severity = "critical" if ratio < lo * 0.5 else "major"
    return [
        Finding(
            id=new_id(),
            dimension="layout",
            severity=severity,
            bbox=union_bbox,
            measured=Measured(value=round(ratio, 2), expected=EXPECTED_ALIGNMENT_RATIO, unit=" alignment ratio"),
        )
    ]
