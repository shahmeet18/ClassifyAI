from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from backend.app.classification.agents.base import AgentConfig, BaseAgent
from backend.app.classification.agents.registry import AgentRegistry

logger = logging.getLogger("classifyai.agents.orchestrator")


def _get_hermes_cfg() -> Dict[str, str]:
    return {
        "base_url": os.getenv("HERMES_BASE_URL", "").rstrip("/"),
        "api_key": os.getenv("HERMES_API_KEY", ""),
        "model": os.getenv("HERMES_MODEL", "hermes3"),
    }


def hermes_is_configured() -> bool:
    return bool(os.getenv("HERMES_BASE_URL", "").strip())


class AgentOrchestrator:
    """
    Runs 7 classification agents in three phases using asyncio.gather:

    Phase 1 (parallel) — independent detectors:
        pii_detector, pci_detector, phi_detector, business_domain_classifier

    Phase 2 (parallel) — use phase-1 merged tags as context:
        sensitivity_classifier, regulatory_tagger

    Phase 3 (sequential) — uses full context from phases 1+2:
        description_generator

    Falls back to ClassificationEngine.classify_with_settings on any failure.
    """

    PHASE1 = ["pii_detector", "pci_detector", "phi_detector", "business_domain_classifier"]
    PHASE2 = ["sensitivity_classifier", "regulatory_tagger"]
    PHASE3 = ["description_generator"]

    @classmethod
    async def classify(
        cls,
        table_name: str,
        column_name: str,
        column_type: str,
        sample_values: List[str],
        fallback_llm_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point.  Returns the unified classification dict.
        Falls back to existing engine if Hermes is not configured or fails.
        """
        if not hermes_is_configured():
            logger.debug("HERMES_BASE_URL not set — skipping agent layer")
            return await cls._fallback(
                column_name, column_type, sample_values, table_name, fallback_llm_config
            )

        registry = AgentRegistry()
        hermes_cfg = _get_hermes_cfg()

        try:
            # ── Phase 1 ─────────────────────────────────────────────────────
            p1 = await cls._run_phase(
                cls.PHASE1, registry, hermes_cfg,
                table_name, column_name, column_type, sample_values, context=None,
            )
            p1_ctx = cls._merge_phase1(p1)

            # ── Phase 2 ─────────────────────────────────────────────────────
            p2 = await cls._run_phase(
                cls.PHASE2, registry, hermes_cfg,
                table_name, column_name, column_type, sample_values, context=p1_ctx,
            )

            # ── Phase 3 ─────────────────────────────────────────────────────
            full_ctx = cls._merge_phase2(p1_ctx, p2)
            p3 = await cls._run_phase(
                cls.PHASE3, registry, hermes_cfg,
                table_name, column_name, column_type, sample_values, context=full_ctx,
            )

            return cls._assemble(p1_ctx, p2, p3)

        except Exception as exc:
            logger.warning(
                "Agent orchestration failed for %s.%s: %s — falling back",
                table_name, column_name, exc,
            )
            result = await cls._fallback(
                column_name, column_type, sample_values, table_name, fallback_llm_config
            )
            result["reasoning"] = f"[agent-error: {exc}] Fallback: {result['reasoning']}"
            return result

    # ── phase runner ──────────────────────────────────────────────────────────

    @classmethod
    async def _run_phase(
        cls,
        agent_ids: List[str],
        registry: AgentRegistry,
        hermes_cfg: Dict[str, str],
        table_name: str,
        column_name: str,
        data_type: str,
        sample_values: List[str],
        context: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Runs all agents in the list concurrently.
        Individual failures are caught and logged; other agents still complete.
        Returns {agent_id: result_dict} for succeeded agents only.
        """

        async def _safe(agent_id: str):
            cfg = registry.get(agent_id)
            if cfg is None or not cfg.enabled:
                return agent_id, None
            agent = BaseAgent(config=cfg, hermes_cfg=hermes_cfg)
            try:
                result = await agent.run(
                    table_name=table_name,
                    column_name=column_name,
                    data_type=data_type,
                    sample_values=sample_values,
                    context=context,
                )
                return agent_id, result
            except Exception as exc:
                logger.warning("Agent '%s' failed: %s", agent_id, exc)
                return agent_id, None

        pairs = await asyncio.gather(*[_safe(aid) for aid in agent_ids])
        return {aid: res for aid, res in pairs if res is not None}

    # ── mergers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _merge_phase1(results: Dict[str, Any]) -> Dict[str, Any]:
        """Flatten phase-1 outputs into a single context dict."""
        pii = results.get("pii_detector", {})
        pci = results.get("pci_detector", {})
        phi = results.get("phi_detector", {})
        dom = results.get("business_domain_classifier", {})

        return {
            "pii_tags": pii.get("pii_tags", []),
            "pci_tags": pci.get("pci_tags", []),
            "phi_tags": phi.get("phi_tags", []),
            "domain_tags": dom.get("domain_tags", []),
            "ai_readiness_tags": dom.get("ai_readiness_tags", []),
            "business_domain": dom.get("business_domain", "Operational"),
            "_confidences": {
                "pii": pii.get("confidence", 0.0),
                "pci": pci.get("confidence", 0.0),
                "phi": phi.get("confidence", 0.0),
                "domain": dom.get("confidence", 0.0),
            },
        }

    @staticmethod
    def _merge_phase2(
        p1_ctx: Dict[str, Any], p2: Dict[str, Any]
    ) -> Dict[str, Any]:
        merged = dict(p1_ctx)
        sens = p2.get("sensitivity_classifier", {})
        reg = p2.get("regulatory_tagger", {})
        merged["sensitivity_level"] = sens.get("sensitivity_level", "Internal")
        merged["sensitivity_confidence"] = sens.get("confidence", 0.5)
        merged["sensitivity_reasoning"] = sens.get("reasoning", "")
        merged["regulatory_tags"] = reg.get("regulatory_tags", [])
        merged["regulatory_confidence"] = reg.get("confidence", 0.5)
        return merged

    @staticmethod
    def _assemble(
        p1_ctx: Dict[str, Any],
        p2: Dict[str, Any],
        p3: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Builds the canonical classification dict the rest of the app expects."""
        sens = p2.get("sensitivity_classifier", {})
        reg = p2.get("regulatory_tagger", {})
        desc = p3.get("description_generator", {})

        # Collect and deduplicate all data-type tags
        raw_tags = (
            p1_ctx.get("pii_tags", [])
            + p1_ctx.get("pci_tags", [])
            + p1_ctx.get("phi_tags", [])
            + p1_ctx.get("domain_tags", [])
            + p1_ctx.get("ai_readiness_tags", [])
        )
        seen: set = set()
        data_type_tags = [t for t in raw_tags if not (t in seen or seen.add(t))]
        if not data_type_tags:
            data_type_tags = ["BusinessDomain.Operational"]

        # Average confidence across all agents that responded
        confs = list(p1_ctx.get("_confidences", {}).values())
        confs.append(sens.get("confidence", 0.5))
        confs.append(reg.get("confidence", 0.5))
        avg_conf = round(sum(c for c in confs if c) / max(len(confs), 1), 4)

        reasoning_parts = []
        if sens.get("reasoning"):
            reasoning_parts.append(sens["reasoning"])
        if reg.get("reasoning"):
            reasoning_parts.append(f"Regulatory: {reg['reasoning']}")

        return {
            "sensitivity_level": sens.get("sensitivity_level", "Internal"),
            "data_type_tags": data_type_tags,
            "regulatory_tags": reg.get("regulatory_tags", []),
            "business_domain": p1_ctx.get("business_domain", "Operational"),
            "confidence_score": avg_conf,
            "reasoning": " | ".join(reasoning_parts) or "Agent-based classification.",
            "classification_method": "Agent",
            # Internal key: consumed by run_background_scan, never persisted to Classification
            "_agent_description": desc.get("description", ""),
        }

    @staticmethod
    async def _fallback(
        column_name: str,
        column_type: str,
        sample_values: List[str],
        table_name: str,
        llm_config: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        from backend.app.classification.engine import ClassificationEngine
        return await ClassificationEngine.classify_with_settings(
            column_name=column_name,
            column_type=column_type,
            sample_values=sample_values,
            table_name=table_name,
            llm_config=llm_config,
        )
