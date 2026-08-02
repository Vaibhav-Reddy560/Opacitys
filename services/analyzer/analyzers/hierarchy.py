"""Hierarchy analyzer: does the most visually salient region correspond to
where a reader would expect to start (top-left / top-center in most Western
layouts)? Uses OpenCV's spectral-residual saliency model as a proxy for
"what draws the eye first"."""

from __future__ import annotations

import cv2
import numpy as np

from models import Finding, Measured
from shared import TextRegion, new_id

EXPECTED_TOP_BAND_SHARE = (0.25, 1.0)  # fraction of saliency mass in top 40% of image


def analyze(bgr: np.ndarray, _text_regions: list[TextRegion]) -> list[Finding]:
    # _text_regions: unused here, kept for a uniform analyzer(bgr, text_regions)
    # interface -- a future version can weight saliency against reading order.
    h, w = bgr.shape[:2]
    if h < 16 or w < 16:
        return []

    saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
    ok, sal_map = saliency.computeSaliency(bgr)
    if not ok:
        return []

    sal_map = sal_map.astype(np.float64)
    total = sal_map.sum()
    if total <= 0:
        return []

    top_band_h = int(h * 0.4)
    top_mass = sal_map[:top_band_h, :].sum()
    top_share = top_mass / total

    lo, hi = EXPECTED_TOP_BAND_SHARE
    if top_share >= lo:
        return []

    # Locate the actual peak-saliency region to report as the finding's bbox
    # -- this is where the eye is drawn instead of the expected top band.
    ys, xs = np.where(sal_map >= np.percentile(sal_map, 98))
    if len(xs) == 0:
        return []
    bbox = (float(xs.min()), float(ys.min()), float(xs.max() - xs.min()), float(ys.max() - ys.min()))

    return [
        Finding(
            id=new_id(),
            dimension="hierarchy",
            severity="major" if top_share < lo * 0.5 else "minor",
            bbox=bbox,
            measured=Measured(value=round(float(top_share), 2), expected=(lo, hi), unit=" top-band saliency share"),
        )
    ]
