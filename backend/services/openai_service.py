from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AuthenticationError, OpenAI

from backend.schemas.project_schema import PROJECT_UNDERSTANDING_JSON_SCHEMA

logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[1]


class OpenAIServiceError(RuntimeError):
    """Base exception for OpenAI service failures."""


class InvalidAPIKeyError(OpenAIServiceError):
    """Raised when the OpenAI API key is missing or rejected."""


class ModelResponseError(OpenAIServiceError):
    """Raised when the model response is missing or malformed."""


class OpenAIService:
    """Small production-oriented wrapper around the OpenAI Responses API."""

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        load_dotenv(BACKEND_DIR / ".env")
        resolved_api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not resolved_api_key:
            raise InvalidAPIKeyError("OPENAI_API_KEY is not configured.")

        self.model = model or os.getenv("OPENAI_MODEL", "gpt-5.5")
        self.client = OpenAI(api_key=resolved_api_key)

    def analyze_text(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        """Analyze text input and return JSON decoded from the model response."""

        return self._create_structured_response(
            system_prompt=system_prompt,
            input_content=[{"type": "input_text", "text": user_prompt}],
        )

    def analyze_with_images(
        self,
        system_prompt: str,
        user_prompt: str,
        image_paths: list[str],
    ) -> dict[str, Any]:
        """Analyze text plus local image files and return structured JSON."""

        content: list[dict[str, str]] = [{"type": "input_text", "text": user_prompt}]
        for image_path in image_paths:
            content.append({"type": "input_image", "image_url": self._image_to_data_url(image_path)})

        return self._create_structured_response(system_prompt=system_prompt, input_content=content)

    def _create_structured_response(
        self,
        system_prompt: str,
        input_content: list[dict[str, str]],
    ) -> dict[str, Any]:
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": system_prompt}],
                    },
                    {
                        "role": "user",
                        "content": input_content,
                    },
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "project_understanding",
                        "schema": PROJECT_UNDERSTANDING_JSON_SCHEMA,
                        "strict": True,
                    }
                },
            )
        except AuthenticationError as exc:
            logger.exception("OpenAI authentication failed")
            raise InvalidAPIKeyError("OpenAI API key is invalid.") from exc
        except APIStatusError as exc:
            logger.exception("OpenAI API returned an error")
            raise OpenAIServiceError(f"OpenAI API error: {exc.status_code}") from exc
        except APIConnectionError as exc:
            logger.exception("OpenAI API connection failed")
            raise OpenAIServiceError("Could not connect to OpenAI API.") from exc

        raw_text = getattr(response, "output_text", None)
        if not raw_text:
            raise ModelResponseError("OpenAI response did not contain output_text.")

        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            logger.exception("Failed to parse model JSON response")
            raise ModelResponseError("OpenAI response was not valid JSON.") from exc

        if not isinstance(parsed, dict):
            raise ModelResponseError("OpenAI response JSON must be an object.")

        return parsed

    @staticmethod
    def _image_to_data_url(image_path: str) -> str:
        path = Path(image_path)
        if not path.is_file():
            raise FileNotFoundError(f"Image file not found: {image_path}")

        mime_type, _ = mimetypes.guess_type(path.name)
        if mime_type is None or not mime_type.startswith("image/"):
            raise ValueError(f"Unsupported image file type: {image_path}")

        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"
