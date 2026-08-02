"""Spacing analyzer: gap consistency between adjacent content blocks. Real
grid systems keep gaps on a rhythm (e.g. multiples of 8px); wildly uneven
gaps read as "unintentional" even to viewers who can't say why."""

from __future__ import annotations

import cv2
import numpy as np

from models import Finding, Measured
from shared import TextRegion, detect_content_boxes, new_id

EXPECTED_COEFFICIENT_OF_VARIATION = (0.0, 0.5)  # std/mean of gaps


def _nearest_gap(box, others) -> float | None:
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2
    best = None
    for ox, oy, ow, oh in others:
        ocx, ocy = ox + ow / 2, oy + oh / 2
        # Gap between box edges along the dominant axis of separation.
        dx = max(ox - (x + w), x - (ox + ow), 0)
        dy = max(oy - (y + h), y - (oy + oh), 0)
        gap = dx if dx > dy else dy
        if gap <= 0:
            continue
        if best is None or gap < best:
            best = gap
    return best


def analyze(bgr: np.ndarray, text_regions: list[TextRegion]) -> list[Finding]:
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    boxes = detect_content_boxes(gray)
    if len(text_regions) >= 4:
        boxes = [tuple(int(v) for v in r.bbox) for r in text_regions]

    if len(boxes) < 4:
        return []

    gaps = []
    for i, box in enumerate(boxes):
        others = [b for j, b in enumerate(boxes) if j != i]
        g = _nearest_gap(box, others)
        if g is not None:
            gaps.append(g)

    if len(gaps) < 3:
        return []

    gaps_arr = np.array(gaps, dtype=np.float64)
    mean = float(gaps_arr.mean())
    std = float(gaps_arr.std())
    cv = std / mean if mean > 0 else 0.0

    lo, hi = EXPECTED_COEFFICIENT_OF_VARIATION
    if cv <= hi:
        return []

    xs = [b[0] for b in boxes]
    ys = [b[1] for b in boxes]
    x2s = [b[0] + b[2] for b in boxes]
    y2s = [b[1] + b[3] for b in boxes]
    union_bbox = (min(xs), min(ys), max(x2s) - min(xs), max(y2s) - min(ys))

    severity = "major" if cv > hi * 2 else "minor"
    return [
        Finding(
            id=new_id(),
            dimension="spacing",
            severity=severity,
            bbox=union_bbox,
            measured=Measured(value=round(cv, 2), expected=(lo, hi), unit=" gap variation (CV)"),
        )
    ]
