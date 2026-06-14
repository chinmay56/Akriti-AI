from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from backend.schemas.execution_plan_schema import ExecutionPlan
from backend.schemas.project_schema import ProjectUnderstanding
from backend.schemas.task_schema import Task


class ExecutionRequest(BaseModel):
    """Request payload for executing one task from an execution plan."""

    model_config = ConfigDict(extra="forbid")

    project_understanding: ProjectUnderstanding
    execution_plan: ExecutionPlan
    task: Task
