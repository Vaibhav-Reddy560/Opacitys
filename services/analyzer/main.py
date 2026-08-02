import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from models import AnalyzeRequest, AnalyzerResponse
from pipeline import run_pipeline

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Opacitys Analyzer Service", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzerResponse)
async def analyze(req: AnalyzeRequest):
    try:
        return await run_pipeline(req.image_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 -- surfaced to the caller deliberately
        logging.exception("analysis failed")
        return JSONResponse(status_code=502, content={"error": str(exc)})
