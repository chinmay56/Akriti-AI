from __future__ import annotations

import logging

from pydantic import ValidationError

from prompts.chat_prompt import CHAT_SYSTEM_PROMPT, build_chat_user_prompt
from schemas.chat_schema import ChatModelResponse, ChatRequest, ChatResponse
from schemas.execution_artifact import CodeArtifact
from services.chat_service import ChatService
from services.file_system_service import FileSystemService, FileSystemServiceError
from services.openai_service import ModelResponseError

logger = logging.getLogger(__name__)


class ChatAgent:
    """In-app coding assistant that can answer and apply safe project file changes."""

    def __init__(
        self,
        chat_service: ChatService | None = None,
        file_system_service: FileSystemService | None = None,
    ) -> None:
        self.chat_service = chat_service or ChatService()
        self.file_system_service = file_system_service or FileSystemService()

    def respond(self, request: ChatRequest) -> ChatResponse:
        context = self._collect_context(request)
        raw_response = self.chat_service.chat(
            system_prompt=CHAT_SYSTEM_PROMPT,
            user_prompt=build_chat_user_prompt(context),
        )
        model_response = self._validate_model_response(raw_response)

        generated_files = []
        modified_files = []
        warnings = list(model_response.warnings)
        changes = self._filter_changes_by_allowed_prefixes(
            changes=model_response.changes,
            allowed_file_prefixes=request.allowed_file_prefixes,
            warnings=warnings,
        )

        if changes:
            if not request.project:
                warnings.append("Changes were not applied because no generated project is selected.")
            elif request.apply_changes:
                try:
                    generated_files, modified_files = self.file_system_service.apply_artifacts(
                        project_name=request.project,
                        artifacts=changes,
                    )
                except FileSystemServiceError as exc:
                    logger.exception("Chat file application failed")
                    warnings.append(str(exc))

        return ChatResponse(
            reply=model_response.reply,
            generated_files=generated_files,
            modified_files=modified_files,
            warnings=warnings,
        )

    def _collect_context(self, request: ChatRequest) -> dict[str, object]:
        file_tree: list[str] = []
        active_file_content = ""

        if request.project:
            file_tree = self.file_system_service.list_files(request.project)[:300]
            if request.file_path:
                try:
                    active_file_content = self.file_system_service.read_file(
                        project=request.project,
                        file_path=request.file_path,
                    )
                except FileSystemServiceError as exc:
                    active_file_content = f"Could not read active file: {exc}"

        return {
            "message": request.message,
            "selected_project": request.project,
            "selected_file": request.file_path,
            "apply_changes": request.apply_changes,
            "allowed_file_prefixes": request.allowed_file_prefixes,
            "file_tree": file_tree,
            "active_file_content": active_file_content,
            "output_root": str(self.file_system_service.output_root),
        }

    @staticmethod
    def _filter_changes_by_allowed_prefixes(
        changes: list[CodeArtifact],
        allowed_file_prefixes: list[str],
        warnings: list[str],
    ) -> list[CodeArtifact]:
        if not allowed_file_prefixes:
            return changes

        normalized_prefixes = [prefix.replace("\\", "/").rstrip("/") + "/" for prefix in allowed_file_prefixes]
        accepted = []
        for change in changes:
            normalized_path = change.file_path.replace("\\", "/").lstrip("/")
            if any(normalized_path.startswith(prefix) for prefix in normalized_prefixes):
                accepted.append(change)
            else:
                warnings.append(
                    f"Skipped {change.file_path} because extension visual edits are limited to frontend source files."
                )
        return accepted

    @staticmethod
    def _validate_model_response(raw_response: dict[str, object]) -> ChatModelResponse:
        try:
            return ChatModelResponse.model_validate(raw_response)
        except ValidationError as exc:
            logger.exception("Invalid chat model response")
            raise ModelResponseError("Chat response did not match schema.") from exc
