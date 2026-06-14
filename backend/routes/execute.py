from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.agents.execution_agent import ExecutionAgent, ExecutionValidationError
from backend.schemas.execution_request import ExecutionRequest
from backend.schemas.execution_result import ExecutionResult
from backend.services.openai_service import InvalidAPIKeyError, ModelResponseError, OpenAIServiceError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/execute", response_model=ExecutionResult)
def execute_task(request: ExecutionRequest) -> ExecutionResult:
    logger.info("Request received: POST /execute task_id=%s", request.task.task_id)
    try:
        agent = ExecutionAgent()
        return agent.execute_task(
            project_understanding=request.project_understanding,
            execution_plan=request.execution_plan,
            task=request.task,
        )
    except Exception as exc:
        raise _to_http_exception(exc) from exc


def _to_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, InvalidAPIKeyError):
        logger.exception("Invalid OpenAI API key")
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OpenAI API key is missing or invalid.",
        )
    if isinstance(exc, ExecutionValidationError):
        logger.exception("Execution validation error")
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, ModelResponseError):
        logger.exception("Invalid execution response")
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, OpenAIServiceError):
        logger.exception("OpenAI service error")
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, ValueError):
        logger.exception("Invalid execution request")
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    logger.exception("Unexpected execution error")
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected execution error.",
    )
