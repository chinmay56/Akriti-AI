from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from schemas.execution_plan_schema import ExecutionPlan
from schemas.project_schema import ProjectUnderstanding
from schemas.task_schema import Task


class ExecutionRequest(BaseModel):
    """Request payload for executing one task from an execution plan."""

    model_config = ConfigDict(extra="forbid")

    project_understanding: ProjectUnderstanding
    execution_plan: ExecutionPlan
    task: Task
