from __future__ import annotations

import logging
import os
import threading
from typing import Dict, List, Optional

import yaml

from backend.app.classification.agents.base import AgentConfig

logger = logging.getLogger("classifyai.agents.registry")

_YAML_PATH = os.path.join(os.path.dirname(__file__), "agents.yaml")


def _multiline_str_representer(dumper: yaml.Dumper, data: str) -> yaml.ScalarNode:
    """Use literal block style (|) for strings that contain newlines."""
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


yaml.add_representer(str, _multiline_str_representer)


class AgentRegistry:
    """
    Singleton that loads agents.yaml on first access and auto-reloads when the
    file changes on disk (mtime check).

    Public API:
        get(agent_id)          → AgentConfig | None
        list_all()             → list[AgentConfig]
        update(agent_id, patch)→ AgentConfig   (persists to disk)
    """

    _instance: Optional["AgentRegistry"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "AgentRegistry":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    inst = super().__new__(cls)
                    inst._configs: Dict[str, AgentConfig] = {}
                    inst._yaml_mtime: float = 0.0
                    inst._yaml_path: str = _YAML_PATH
                    inst._reload()
                    cls._instance = inst
        return cls._instance

    # ── public ────────────────────────────────────────────────────────────────

    def get(self, agent_id: str) -> Optional[AgentConfig]:
        self._maybe_reload()
        return self._configs.get(agent_id)

    def list_all(self) -> List[AgentConfig]:
        self._maybe_reload()
        return list(self._configs.values())

    def update(self, agent_id: str, patch: dict) -> AgentConfig:
        """
        Applies a partial update to a single agent, then persists agents.yaml.
        Allowed keys: name, description, enabled, system_prompt, output_schema
        """
        self._maybe_reload()
        cfg = self._configs.get(agent_id)
        if cfg is None:
            raise KeyError(f"Agent '{agent_id}' not found")

        allowed = {"name", "description", "enabled", "system_prompt", "output_schema"}
        for key, val in patch.items():
            if key in allowed:
                setattr(cfg, key, val)

        self._save()
        return cfg

    # ── internal ──────────────────────────────────────────────────────────────

    def _maybe_reload(self) -> None:
        try:
            mtime = os.path.getmtime(self._yaml_path)
        except OSError:
            return
        if mtime != self._yaml_mtime:
            with self._lock:
                mtime = os.path.getmtime(self._yaml_path)
                if mtime != self._yaml_mtime:
                    self._reload()

    def _reload(self) -> None:
        try:
            with open(self._yaml_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            new_configs: Dict[str, AgentConfig] = {}
            for entry in data.get("agents", []):
                cfg = AgentConfig(
                    id=entry["id"],
                    name=entry.get("name", entry["id"]),
                    description=entry.get("description", ""),
                    enabled=entry.get("enabled", True),
                    system_prompt=entry.get("system_prompt", ""),
                    output_schema=entry.get("output_schema", {}),
                )
                new_configs[cfg.id] = cfg
            self._configs = new_configs
            self._yaml_mtime = os.path.getmtime(self._yaml_path)
            logger.info(
                "AgentRegistry loaded %d agents from %s",
                len(new_configs),
                self._yaml_path,
            )
        except Exception as exc:
            logger.error("Failed to load agents.yaml: %s", exc)

    def _save(self) -> None:
        """Serialises current in-memory state back to agents.yaml."""
        agents_list = [
            {
                "id": cfg.id,
                "name": cfg.name,
                "description": cfg.description,
                "enabled": cfg.enabled,
                "system_prompt": cfg.system_prompt,
                "output_schema": cfg.output_schema,
            }
            for cfg in self._configs.values()
        ]
        with open(self._yaml_path, "w", encoding="utf-8") as f:
            yaml.dump(
                {"agents": agents_list},
                f,
                default_flow_style=False,
                allow_unicode=True,
                sort_keys=False,
            )
        self._yaml_mtime = os.path.getmtime(self._yaml_path)
        logger.info("agents.yaml saved successfully")
