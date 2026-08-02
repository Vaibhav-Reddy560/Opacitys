"""Shared helpers used by every analyzer module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class TextRegion:
    bbox: tuple[float, float, float, float]  # x, y, w, h
    text: str
    confidence: float


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def relative_luminance(rgb: np.ndarray) -> float:
    """WCAG relative luminance for a single sRGB color, rgb in [0,255]."""
    srgb = rgb.astype(np.float64) / 255.0
    linear = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    r, g, b = linear
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def wcag_contrast(rgb_a: np.ndarray, rgb_b: np.ndarray) -> float:
    """WCAG 2.x contrast ratio between two sRGB colors, always >= 1."""
    l1 = relative_luminance(rgb_a)
    l2 = relative_luminance(rgb_b)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def severity_from_gap(value: float, expected_min: float, expected_max: float) -> str | None:
    """How far outside [expected_min, expected_max] does `value` fall, as a
    fraction of the expected range's width? Returns None if within range."""
    if expected_min <= value <= expected_max:
        return None
    span = max(expected_max - expected_min, 1e-6)
    gap = expected_min - value if value < expected_min else value - expected_max
    ratio = gap / span
    if ratio >= 1.0:
        return "critical"
    if ratio >= 0.4:
        return "major"
    return "minor"


def detect_content_boxes(gray: np.ndarray, min_area_frac: float = 0.001) -> list[tuple[int, int, int, int]]:
    """Coarse content-block detection via adaptive threshold + contours.
    Used by layout/spacing/balance — this is a proxy for "distinct visual
    elements", not a text/object detector."""
    h, w = gray.shape[:2]
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 120)
    dilated = cv2.dilate(edges, np.ones((9, 9), np.uint8), iterations=1)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = min_area_frac * h * w
    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        if bw * bh >= min_area:
            boxes.append((x, y, bw, bh))
    return boxes
