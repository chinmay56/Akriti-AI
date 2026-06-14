from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.agents.planning_agent import PlanningAgent, PlanningValidationError
from backend.schemas.execution_plan_schema import ExecutionPlan
from backend.schemas.planning_request import PlanningRequest
from backend.schemas.project_schema import ProjectUnderstanding
from backend.services.openai_service import InvalidAPIKeyError, ModelResponseError, OpenAIServiceError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/plan", response_model=ExecutionPlan)
def create_plan(project_understanding: ProjectUnderstanding) -> ExecutionPlan:
    logger.info("Request received: POST /plan")
    try:
        agent = PlanningAgent()
        return agent.create_plan(project_understanding)
    except Exception as exc:
        raise _to_http_exception(exc) from exc


@router.post("/plan/configured", response_model=ExecutionPlan)
def create_configured_plan(request: PlanningRequest) -> ExecutionPlan:
    logger.info("Request received: POST /plan/configured complexity=%s", request.complexity)
    try:
        agent = PlanningAgent()
        return agent.create_plan(
            project_understanding=request.project_understanding,
            complexity=request.complexity,
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
    if isinstance(exc, (ModelResponseError, PlanningValidationError)):
        logger.exception("Invalid planning response")
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, OpenAIServiceError):
        logger.exception("OpenAI service error")
        return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    if isinstance(exc, ValueError):
        logger.exception("Invalid planning request")
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    logger.exception("Unexpected planning error")
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected planning error.",
    )
