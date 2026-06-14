from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ProjectUnderstanding(BaseModel):
    """Validated project knowledge extracted from requirements and visual assets."""

    model_config = ConfigDict(extra="forbid")

    project_name: str = Field(..., description="Project or product name.")
    summary: str = Field(..., description="Concise project summary.")
    functional_requirements: list[str] = Field(...)
    non_functional_requirements: list[str] = Field(...)
    pages: list[str] = Field(...)
    database_entities: list[str] = Field(...)
    apis: list[str] = Field(...)
    components: list[str] = Field(...)
    user_flows: list[str] = Field(...)
    implementation_notes: list[str] = Field(...)


PROJECT_UNDERSTANDING_JSON_SCHEMA: dict[str, object] = ProjectUnderstanding.model_json_schema()
