from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.analyze import router as analyze_router
from routes.chat import router as chat_router
from routes.execute import router as execute_router
from routes.files import router as files_router
from routes.planning import router as planning_router
from routes.review import router as review_router

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

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8010,http://127.0.0.1:8010",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)
app.include_router(planning_router)
app.include_router(execute_router)
app.include_router(files_router)
app.include_router(chat_router)
app.include_router(review_router)


@app.get("/", include_in_schema=False)
def api_root() -> dict[str, str]:
    return {
        "name": "Akriti API",
        "frontend": "Run the Next.js frontend from the frontend folder on http://localhost:3000.",
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
