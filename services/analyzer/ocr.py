"""OCR text-region detection, feeding the typography analyzer's grounding
and used as a proxy for "content block" edges by layout/spacing. Guarded:
if the tesseract binary isn't installed on the host, every analyzer that
depends on text_regions degrades to returning no findings rather than
crashing the request -- confidence, not a fake result, is what's sacrificed."""

from __future__ import annotations

import logging

import numpy as np

from shared import TextRegion

logger = logging.getLogger("analyzer.ocr")

try:
    import pytesseract

    _TESSERACT_AVAILABLE = True
except ImportError:  # pragma: no cover
    _TESSERACT_AVAILABLE = False


def detect_text_regions(bgr: np.ndarray, min_confidence: int = 40) -> list[TextRegion]:
    """Returns one TextRegion per text *line*, not per word.

    Word-level boxes would make every layout/spacing comparison meaningless:
    words on the same line trivially share a y-coordinate, so an
    alignment/gap analyzer fed raw word boxes reports near-perfect alignment
    on any text-heavy image regardless of actual layout quality. Grouping by
    tesseract's (block, paragraph, line) index gives the union bbox of each
    line -- a real visual block -- and also gives typography a less noisy
    height signal (one per line instead of per-word, which is skewed by
    ascenders/descenders on individual words).
    """
    if not _TESSERACT_AVAILABLE:
        logger.warning("pytesseract not installed; typography/layout/spacing findings will be skipped")
        return []

    try:
        data = pytesseract.image_to_data(bgr, output_type=pytesseract.Output.DICT)
    except Exception as exc:  # tesseract binary missing, corrupt image, etc.
        logger.warning("OCR failed, continuing without text regions: %s", exc)
        return []

    lines: dict[tuple[int, int, int], dict] = {}
    n = len(data.get("text", []))
    for i in range(n):
        text = data["text"][i].strip()
        try:
            conf = int(float(data["conf"][i]))
        except (ValueError, KeyError):
            conf = -1
        if not text or conf < min_confidence:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        if w <= 0 or h <= 0:
            continue

        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        line = lines.setdefault(key, {"x0": x, "y0": y, "x1": x + w, "y1": y + h, "words": [], "confs": []})
        line["x0"] = min(line["x0"], x)
        line["y0"] = min(line["y0"], y)
        line["x1"] = max(line["x1"], x + w)
        line["y1"] = max(line["y1"], y + h)
        line["words"].append(text)
        line["confs"].append(conf)

    regions: list[TextRegion] = []
    for line in lines.values():
        bbox = (float(line["x0"]), float(line["y0"]), float(line["x1"] - line["x0"]), float(line["y1"] - line["y0"]))
        regions.append(
            TextRegion(
                bbox=bbox,
                text=" ".join(line["words"]),
                confidence=(sum(line["confs"]) / len(line["confs"])) / 100.0,
            )
        )

    return regions
