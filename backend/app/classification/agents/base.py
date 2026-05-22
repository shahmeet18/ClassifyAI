from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("classifyai.agents.base")


@dataclass
class AgentConfig:
    id: str
    name: str
    description: str
    enabled: bool
    system_prompt: str
    output_schema: Dict[str, Any] = field(default_factory=dict)


def _is_anthropic(base_url: str) -> bool:
    return "anthropic.com" in base_url


class BaseAgent:
    """
    Calls an LLM and returns parsed JSON.

    Auto-detects API format from base_url:
      - Contains "anthropic.com" → Anthropic native API (/v1/messages)
      - Everything else          → OpenAI-compatible API (/chat/completions)

    hermes_cfg keys: base_url, api_key, model
    """

    def __init__(
        self,
        config: AgentConfig,
        hermes_cfg: Dict[str, str],
        http_timeout: float = 30.0,
    ) -> None:
        self.config = config
        self.hermes_cfg = hermes_cfg
        self.http_timeout = http_timeout

    def _build_user_message(
        self,
        table_name: str,
        column_name: str,
        data_type: str,
        sample_values: List[str],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        parts = [
            f"Table: {table_name}",
            f"Column: {column_name}",
            f"Data type: {data_type}",
            f"Sample values (up to 20): {json.dumps(sample_values[:20])}",
        ]
        if context:
            parts.append(f"Context from earlier agents: {json.dumps(context)}")
        return "\n".join(parts)

    async def run(
        self,
        table_name: str,
        column_name: str,
        data_type: str,
        sample_values: List[str],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Dispatches to the correct API format and returns parsed JSON.
        Raises RuntimeError on HTTP error or JSON parse failure.
        """
        base_url = self.hermes_cfg.get("base_url", "").rstrip("/")
        if not base_url:
            raise RuntimeError("HERMES_BASE_URL is not configured")

        user_message = self._build_user_message(
            table_name, column_name, data_type, sample_values, context
        )

        if _is_anthropic(base_url):
            return await self._call_anthropic(base_url, user_message)
        return await self._call_openai_compatible(base_url, user_message)

    # ── Anthropic native API (/v1/messages) ──────────────────────────────────

    async def _call_anthropic(self, base_url: str, user_message: str) -> Dict[str, Any]:
        api_key = self.hermes_cfg.get("api_key", "")
        model = self.hermes_cfg.get("model", "claude-haiku-4-5-20251001")

        url = f"{base_url}/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": model,
            "max_tokens": 1024,
            "system": self.config.system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }

        async with httpx.AsyncClient(timeout=self.http_timeout) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise RuntimeError(
                f"Agent '{self.config.id}' Anthropic HTTP {response.status_code}: {response.text[:300]}"
            )

        result = response.json()
        raw_text = result["content"][0]["text"].strip()

        # Strip markdown code fences if model wraps JSON in ```json ... ```
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        return json.loads(raw_text)

    # ── OpenAI-compatible API (/chat/completions) ─────────────────────────────

    async def _call_openai_compatible(self, base_url: str, user_message: str) -> Dict[str, Any]:
        api_key = self.hermes_cfg.get("api_key", "")
        model = self.hermes_cfg.get("model", "hermes3")

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": self.config.system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }

        async with httpx.AsyncClient(timeout=self.http_timeout) as client:
            response = await client.post(
                f"{base_url}/chat/completions", headers=headers, json=payload
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"Agent '{self.config.id}' HTTP {response.status_code}: {response.text[:200]}"
            )

        result = response.json()
        raw_content = result["choices"][0]["message"]["content"]
        return json.loads(raw_content)
