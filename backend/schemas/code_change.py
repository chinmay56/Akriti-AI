from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ChangeType = Literal["created", "modified", "deleted"]


class CodeChange(BaseModel):
    """Description of a file-level code change produced by task execution."""

    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(..., min_length=1)
    change_type: ChangeType
    description: str = Field(..., min_length=1)
