from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from backend.schemas.project_schema import ProjectUnderstanding


PlanComplexity = Literal["simple", "medium", "hard"]


class PlanningRequest(BaseModel):
    """Planning request with adjustable task granularity."""

    model_config = ConfigDict(extra="forbid")

    project_understanding: ProjectUnderstanding
    complexity: PlanComplexity = "medium"
