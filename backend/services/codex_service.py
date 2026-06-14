from __future__ import annotations

from typing import Any

from backend.services.execution_service import ExecutionService


class CodexService:
    """Codex-compatible execution boundary for implementation task orchestration."""

    def __init__(self, execution_service: ExecutionService | None = None) -> None:
        self.execution_service = execution_service or ExecutionService()

    def execute_prompt(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        return self.execution_service.execute(system_prompt=system_prompt, user_prompt=user_prompt)
