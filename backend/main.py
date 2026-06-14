from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routes.analyze import router as analyze_router
from backend.routes.chat import router as chat_router
from backend.routes.execute import router as execute_router
from backend.routes.files import router as files_router
from backend.routes.planning import router as planning_router
from backend.routes.review import router as review_router

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="Akriti API",
    description="Converts project descriptions, diagrams, and mockups into structured project knowledge.",
    version="1.0.0",
)

STATIC_DIR = BASE_DIR / "static"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(analyze_router)
app.include_router(planning_router)
app.include_router(execute_router)
app.include_router(files_router)
app.include_router(chat_router)
app.include_router(review_router)


@app.get("/", include_in_schema=False)
def app_ui() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
