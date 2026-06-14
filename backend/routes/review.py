from __future__ import annotations

import json
import logging

from fastapi import APIRouter

from backend.agents.chat_agent import ChatAgent
from backend.schemas.chat_schema import ChatRequest
from backend.schemas.review_schema import ReviewRequest, ReviewResponse
from backend.services.file_system_service import FileSystemService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["review"])


@router.post("/review", response_model=ReviewResponse)
def review_from_extension(request: ReviewRequest) -> ReviewResponse:
    logger.info("Request received: POST /review request_id=%s", request.requestId)
    try:
        file_system = FileSystemService()
        project = _default_project(file_system)
        prompt = _build_review_prompt(request=request, project=project)

        response = ChatAgent(file_system_service=file_system).respond(
            ChatRequest(
                message=prompt,
                project=project,
                file_path="",
                apply_changes=True,
                allowed_file_prefixes=["frontend/src/", "frontend/app/"],
            )
        )

        changed_files = [
            change.file_path for change in [*response.generated_files, *response.modified_files]
        ]
        summary_parts = [response.reply]
        if changed_files:
            summary_parts.append("Changed files:")
            summary_parts.extend(f"- {path}" for path in changed_files)
        if response.warnings:
            summary_parts.append("Warnings:")
            summary_parts.extend(f"- {warning}" for warning in response.warnings)

        return ReviewResponse(
            requestId=request.requestId,
            stage="completed",
            summary="\n".join(summary_parts),
            filesModified=changed_files,
            diffs=[],
        )
    except Exception as exc:
        logger.exception("Extension review failed")
        return ReviewResponse(
            requestId=request.requestId,
            stage="error",
            error=str(exc),
        )


def _default_project(file_system: FileSystemService) -> str:
    projects = file_system.list_projects()
    if projects:
        return projects[0]
    return "generated-project"


def _build_review_prompt(request: ReviewRequest, project: str) -> str:
    element_context = {
        "selected_element": request.element,
        "page_context": request.pageContext,
        "conversation": request.conversation[-6:],
        "target_project": project,
    }
    return (
        "The user clicked a UI element in the running app and wants a code change. "
        "Use the selected element context to identify what they mean, then update the generated project files.\n\n"
        "This request came from the browser extension visual editor. Treat it as a small frontend UI change unless "
        "the user explicitly asks for backend logic. For color, spacing, text, layout, or styling requests, modify "
        "only existing files under frontend/src or frontend/app. Prefer existing live files such as "
        "frontend/src/pages/index.tsx and frontend/src/styles/Home.module.css. Do not create root-level styles folders. "
        "Do not modify backend files, database files, node_modules, .next, .venv, or runtime data for visual edits. "
        "Keep the change minimal, ideally one CSS file or one TSX file.\n\n"
        f"User prompt:\n{request.userMessage}\n\n"
        f"Clicked element and page context:\n{json.dumps(element_context, indent=2)}"
    )
