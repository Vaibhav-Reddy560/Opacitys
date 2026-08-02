"""Color analyzer: dominant palette + WCAG contrast between text and its
local background, for every OCR-detected text region."""

from __future__ import annotations

import cv2
import numpy as np

from models import Finding, Measured
from shared import TextRegion, new_id, wcag_contrast

WCAG_AA_NORMAL = 4.5


def _dominant_colors(patch: np.ndarray, k: int = 2) -> np.ndarray:
    pixels = patch.reshape(-1, 3).astype(np.float32)
    if len(pixels) < k:
        return np.array([pixels.mean(axis=0)] * k)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(-counts)
    return centers[order]


def analyze(bgr: np.ndarray, text_regions: list[TextRegion]) -> list[Finding]:
    findings: list[Finding] = []
    h, w = bgr.shape[:2]

    for region in text_regions:
        x, y, rw, rh = [int(v) for v in region.bbox]
        x, y = max(0, x), max(0, y)
        rw, rh = max(1, min(rw, w - x)), max(1, min(rh, h - y))
        pad = max(4, rh // 2)
        y0, y1 = max(0, y - pad), min(h, y + rh + pad)
        x0, x1 = max(0, x - pad), min(w, x + rw + pad)
        patch = bgr[y0:y1, x0:x1]
        if patch.size == 0:
            continue

        # Two-cluster split approximates "text ink color" vs "local
        # background color" without needing per-pixel text segmentation.
        centers_bgr = _dominant_colors(patch, k=2)
        centers_rgb = centers_bgr[:, ::-1]
        contrast = wcag_contrast(centers_rgb[0], centers_rgb[1])

        if contrast < WCAG_AA_NORMAL:
            findings.append(
                Finding(
                    id=new_id(),
                    dimension="color",
                    severity="critical" if contrast < 3.0 else "major",
                    bbox=(x, y, rw, rh),
                    measured=Measured(value=round(float(contrast), 2), expected=(WCAG_AA_NORMAL, 21.0), unit=":1"),
                )
            )

    return findings
