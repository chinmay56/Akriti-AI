from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from schemas.code_change import CodeChange


ExecutionStatus = Literal["completed", "failed", "needs_review"]


class ExecutionResult(BaseModel):
    """Structured execution report for a single development task."""

    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(..., min_length=1)
    status: ExecutionStatus
    summary: str = Field(..., min_length=1)
    generated_files: list[CodeChange] = Field(...)
    modified_files: list[CodeChange] = Field(...)
    implementation_notes: list[str] = Field(...)
    warnings: list[str] = Field(...)
    next_recommended_tasks: list[str] = Field(...)


EXECUTION_RESULT_JSON_SCHEMA: dict[str, object] = ExecutionResult.model_json_schema()
