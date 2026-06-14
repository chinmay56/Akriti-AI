from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ArtifactChangeType = Literal["created", "modified", "deleted"]
ArtifactStatus = Literal["completed", "failed", "needs_review"]


class CodeArtifact(BaseModel):
    """Internal file artifact with source content for filesystem writes."""

    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(..., min_length=1)
    change_type: ArtifactChangeType
    description: str = Field(..., min_length=1)
    content: str = Field(..., description="Complete file content. Use an empty string for deleted files.")


class ExecutionArtifactPlan(BaseModel):
    """Internal model response that contains real file contents to apply."""

    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(..., min_length=1)
    status: ArtifactStatus
    summary: str = Field(..., min_length=1)
    changes: list[CodeArtifact] = Field(..., min_length=1)
    implementation_notes: list[str] = Field(...)
    warnings: list[str] = Field(...)
    next_recommended_tasks: list[str] = Field(...)


EXECUTION_ARTIFACT_PLAN_JSON_SCHEMA: dict[str, object] = ExecutionArtifactPlan.model_json_schema()
