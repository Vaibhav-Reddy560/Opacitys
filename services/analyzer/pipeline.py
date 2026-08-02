"""Orchestrates Track A: fetch the image, detect text regions once, run
every deterministic analyzer against the same image + text regions, and
merge their findings into one AnalyzerResponse."""

from __future__ import annotations

import logging

import cv2
import httpx
import numpy as np

from analyzers import balance, color, hierarchy, layout, spacing, typography
from models import AnalyzerResponse, Finding
from ocr import detect_text_regions

logger = logging.getLogger("analyzer.pipeline")

PIPELINE_VERSION = "v1"

ANALYZERS = [color, typography, layout, spacing, hierarchy, balance]


async def fetch_image(image_url: str) -> np.ndarray:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
    arr = np.frombuffer(resp.content, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Could not decode image from {image_url}")
    return bgr


async def run_pipeline(image_url: str) -> AnalyzerResponse:
    bgr = await fetch_image(image_url)
    h, w = bgr.shape[:2]

    text_regions = detect_text_regions(bgr)

    findings: list[Finding] = []
    for module in ANALYZERS:
        try:
            findings.extend(module.analyze(bgr, text_regions))
        except Exception:
            # One analyzer failing (e.g. a saliency edge case on a tiny
            # image) shouldn't take down the whole critique -- it just means
            # that dimension has no findings this run.
            logger.exception("analyzer %s failed", module.__name__)

    return AnalyzerResponse(pipelineVersion=PIPELINE_VERSION, width=w, height=h, findings=findings)
