from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


TaskPriority = Literal["high", "medium", "low"]
TaskComplexity = Literal["small", "medium", "large"]


class Task(BaseModel):
    """Atomic development task with dependency and validation metadata."""

    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    phase: str = Field(..., min_length=1)
    priority: TaskPriority
    estimated_complexity: TaskComplexity
    dependencies: list[str] = Field(...)
    acceptance_criteria: list[str] = Field(..., min_length=1)
