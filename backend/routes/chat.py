from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.agents.chat_agent import ChatAgent
from backend.schemas.chat_schema import ChatRequest, ChatResponse
from backend.services.openai_service import InvalidAPIKeyError, ModelResponseError, OpenAIServiceError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    logger.info("Request received: POST /chat")
    try:
        return ChatAgent().respond(request)
    except Exception as exc:
        raise _to_http_exception(exc) from exc


def _to_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, InvalidAPIKeyError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OpenAI API key is missing or invalid.",
        )
    if isinstance(exc, ModelResponseError):
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, OpenAIServiceError):
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    logger.exception("Unexpected chat error")
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected chat error.",
    )
