from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, AuthenticationError, OpenAI

from schemas.chat_schema import CHAT_MODEL_RESPONSE_JSON_SCHEMA
from services.openai_service import InvalidAPIKeyError, ModelResponseError, OpenAIServiceError

logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[1]


class ChatService:
    """OpenAI-backed structured chat service for the in-app coding assistant."""

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        load_dotenv(BACKEND_DIR / ".env")
        resolved_api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not resolved_api_key:
            raise InvalidAPIKeyError("OPENAI_API_KEY is not configured.")

        self.model = model or os.getenv("OPENAI_CHAT_MODEL") or os.getenv("OPENAI_MODEL", "gpt-5.5")
        self.client = OpenAI(api_key=resolved_api_key)

    def chat(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
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
                        "content": [{"type": "input_text", "text": user_prompt}],
                    },
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "chat_model_response",
                        "schema": CHAT_MODEL_RESPONSE_JSON_SCHEMA,
                        "strict": True,
                    }
                },
            )
        except AuthenticationError as exc:
            logger.exception("OpenAI authentication failed during chat")
            raise InvalidAPIKeyError("OpenAI API key is invalid.") from exc
        except APIStatusError as exc:
            logger.exception("OpenAI API returned an error during chat")
            detail = getattr(exc, "message", None) or str(exc)
            raise OpenAIServiceError(f"OpenAI API error: {exc.status_code} - {detail}") from exc
        except APIConnectionError as exc:
            logger.exception("OpenAI API connection failed during chat")
            raise OpenAIServiceError("Could not connect to OpenAI API.") from exc

        raw_text = getattr(response, "output_text", None)
        if not raw_text:
            raise ModelResponseError("OpenAI response did not contain output_text.")

        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            logger.exception("Failed to parse chat JSON response")
            raise ModelResponseError("OpenAI chat response was not valid JSON.") from exc

        if not isinstance(parsed, dict):
            raise ModelResponseError("OpenAI chat response JSON must be an object.")
        return parsed
