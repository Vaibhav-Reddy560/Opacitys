"""Pydantic models mirroring src/lib/critique/types.ts. Keep these two files
in sync by hand — there are only a handful of fields."""

from typing import Literal, Tuple

from pydantic import BaseModel, Field

Dimension = Literal["hierarchy", "color", "typography", "layout", "spacing", "balance", "originality"]
Severity = Literal["critical", "major", "minor"]


class Measured(BaseModel):
    value: float
    expected: Tuple[float, float]
    unit: str


class Finding(BaseModel):
    id: str
    dimension: Dimension
    severity: Severity
    bbox: Tuple[float, float, float, float]  # x, y, w, h in source-image px
    measured: Measured


class AnalyzeRequest(BaseModel):
    image_url: str = Field(alias="image_url")

    class Config:
        populate_by_name = True


class AnalyzerResponse(BaseModel):
    pipelineVersion: str
    width: int
    height: int
    findings: list[Finding]
