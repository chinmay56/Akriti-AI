from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


PipelineStage = Literal[
    "idle",
    "understanding",
    "locating",
    "generating",
    "preparing_diff",
    "waiting_approval",
    "applying",
    "completed",
    "error",
]


class ReviewRequest(BaseModel):
    """Browser-extension request created from a clicked UI element and user prompt."""

    model_config = ConfigDict(extra="allow")

    requestId: str = Field(..., min_length=1)
    element: dict[str, Any]
    pageContext: dict[str, Any]
    conversation: list[dict[str, Any]] = Field(default_factory=list)
    userMessage: str = Field(..., min_length=1)
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    sentAt: str


class FileDiff(BaseModel):
    filePath: str
    diff: str
    language: str = ""


class ReviewResponse(BaseModel):
    """Browser-extension response shape consumed by the floating chat panel."""

    requestId: str
    stage: PipelineStage
    summary: str | None = None
    filesModified: list[str] | None = None
    diffs: list[FileDiff] | None = None
    previewUrl: str | None = None
    error: str | None = None
