from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from agents.understanding_agent import UnderstandingAgent
from schemas.project_schema import ProjectUnderstanding
from services.openai_service import InvalidAPIKeyError, ModelResponseError, OpenAIServiceError

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".yaml", ".yml", ".xml"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


class AnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, description="Project description or document text.")


@router.post("/analyze", response_model=ProjectUnderstanding)
def analyze_project(request: AnalyzeRequest) -> ProjectUnderstanding:
    logger.info("Request received: POST /analyze")
    try:
        agent = UnderstandingAgent()
        return agent.analyze_text(request.content)
    except Exception as exc:
        raise _to_http_exception(exc) from exc


@router.post("/analyze/upload", response_model=ProjectUnderstanding)
async def analyze_uploaded_file(
    file: UploadFile = File(..., description="Text document or image to analyze."),
    content: str = Form(default="", description="Optional extra project context."),
) -> ProjectUnderstanding:
    logger.info("Request received: POST /analyze/upload filename=%s", file.filename)

    try:
        file_bytes = await file.read()
        if not file_bytes:
            raise ValueError("Uploaded file must not be empty.")
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise ValueError("Uploaded file exceeds the 20 MB limit.")

        suffix = Path(file.filename or "").suffix.lower()
        agent = UnderstandingAgent()

        if _is_text_upload(suffix=suffix, content_type=file.content_type):
            logger.info("Analysis started for uploaded text file")
            file_text = _decode_text_file(file_bytes)
            combined_content = _combine_content(content, file.filename, file_text)
            return agent.analyze_text(combined_content)

        if _is_image_upload(suffix=suffix, content_type=file.content_type):
            logger.info("Analysis started for uploaded image file")
            return _analyze_uploaded_image(agent=agent, file_bytes=file_bytes, suffix=suffix, content=content)

        raise ValueError(
            "Unsupported file type. Upload a text file (.txt, .md, .json, .csv, .yaml, .xml) "
            "or an image file (.png, .jpg, .jpeg, .webp, .gif)."
        )
    except Exception as exc:
        raise _to_http_exception(exc) from exc


SUPPORTED_IMAGE_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
}


def _is_text_upload(suffix: str, content_type: str | None) -> bool:
    return suffix in TEXT_EXTENSIONS or (content_type or "").startswith("text/")


def _is_image_upload(suffix: str, content_type: str | None) -> bool:
    return suffix in IMAGE_EXTENSIONS or (content_type or "").lower() in SUPPORTED_IMAGE_CONTENT_TYPES


def _decode_text_file(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Text files must be UTF-8 encoded.") from exc


def _combine_content(content: str, filename: str | None, file_text: str) -> str:
    parts = []
    if content.strip():
        parts.append(f"Additional context:\n{content.strip()}")
    parts.append(f"Uploaded file: {filename or 'unnamed file'}\n\n{file_text.strip()}")
    return "\n\n".join(parts)


def _analyze_uploaded_image(
    agent: UnderstandingAgent,
    file_bytes: bytes,
    suffix: str,
    content: str,
) -> ProjectUnderstanding:
    temporary_path = _write_temporary_upload(file_bytes=file_bytes, suffix=suffix)
    try:
        if content.strip():
            return agent.analyze_project(content=content, images=[str(temporary_path)])
        return agent.analyze_image(str(temporary_path))
    finally:
        temporary_path.unlink(missing_ok=True)


def _write_temporary_upload(file_bytes: bytes, suffix: str) -> Path:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".upload") as temporary_file:
        temporary_file.write(file_bytes)
        return Path(temporary_file.name)


def _to_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, InvalidAPIKeyError):
        logger.exception("Invalid OpenAI API key")
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OpenAI API key is missing or invalid.",
        )
    if isinstance(exc, ModelResponseError):
        logger.exception("Invalid model response")
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, OpenAIServiceError):
        logger.exception("OpenAI service error")
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, ValueError):
        logger.exception("Invalid analysis request")
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    logger.exception("Unexpected analysis error")
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected analysis error.",
    )
