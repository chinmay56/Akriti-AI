from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.code_change import CodeChange
from backend.schemas.execution_artifact import CodeArtifact


class ChatRequest(BaseModel):
    """Chat request for the in-app coding assistant."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(..., min_length=1)
    project: str = ""
    file_path: str = ""
    apply_changes: bool = True
    allowed_file_prefixes: list[str] = Field(default_factory=list)


class ChatModelResponse(BaseModel):
    """Structured model response before filesystem application."""

    model_config = ConfigDict(extra="forbid")

    reply: str = Field(..., min_length=1)
    changes: list[CodeArtifact] = Field(...)
    warnings: list[str] = Field(...)


class ChatResponse(BaseModel):
    """Final chat response returned to the browser."""

    model_config = ConfigDict(extra="forbid")

    reply: str = Field(..., min_length=1)
    generated_files: list[CodeChange] = Field(...)
    modified_files: list[CodeChange] = Field(...)
    warnings: list[str] = Field(...)


CHAT_MODEL_RESPONSE_JSON_SCHEMA: dict[str, object] = ChatModelResponse.model_json_schema()
