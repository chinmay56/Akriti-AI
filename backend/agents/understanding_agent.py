from __future__ import annotations

import logging

from pydantic import ValidationError

from backend.prompts.understanding_prompt import (
    UNDERSTANDING_SYSTEM_PROMPT,
    build_understanding_user_prompt,
)
from backend.schemas.project_schema import ProjectUnderstanding
from backend.services.openai_service import ModelResponseError, OpenAIService

logger = logging.getLogger(__name__)


class UnderstandingAgent:
    """Agent that turns project material into validated structured knowledge."""

    def __init__(self, openai_service: OpenAIService | None = None) -> None:
        self.openai_service = openai_service or OpenAIService()

    def analyze_text(self, content: str) -> ProjectUnderstanding:
        if not content.strip():
            raise ValueError("Content must not be empty.")

        logger.info("Analysis started for text content")
        user_prompt = build_understanding_user_prompt(content)
        raw_result = self.openai_service.analyze_text(
            system_prompt=UNDERSTANDING_SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
        return self._validate_result(raw_result)

    def analyze_image(self, image_path: str) -> ProjectUnderstanding:
        logger.info("Analysis started for image: %s", image_path)
        user_prompt = build_understanding_user_prompt(
            "Analyze the attached project image, diagram, ERD, flowchart, architecture diagram, or UI mockup."
        )
        raw_result = self.openai_service.analyze_with_images(
            system_prompt=UNDERSTANDING_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            image_paths=[image_path],
        )
        return self._validate_result(raw_result)

    def analyze_project(self, content: str, images: list[str]) -> ProjectUnderstanding:
        if not content.strip() and not images:
            raise ValueError("Provide content, at least one image, or both.")

        logger.info("Analysis started for project content with %d image(s)", len(images))
        user_prompt = build_understanding_user_prompt(content or "Analyze the attached project assets.")

        if images:
            raw_result = self.openai_service.analyze_with_images(
                system_prompt=UNDERSTANDING_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                image_paths=images,
            )
        else:
            raw_result = self.openai_service.analyze_text(
                system_prompt=UNDERSTANDING_SYSTEM_PROMPT,
                user_prompt=user_prompt,
            )

        return self._validate_result(raw_result)

    @staticmethod
    def _validate_result(raw_result: dict[str, object]) -> ProjectUnderstanding:
        try:
            result = ProjectUnderstanding.model_validate(raw_result)
        except ValidationError as exc:
            logger.exception("Model response failed schema validation")
            raise ModelResponseError("OpenAI response did not match ProjectUnderstanding schema.") from exc

        logger.info("Analysis completed")
        return result
