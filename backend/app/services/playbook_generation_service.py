import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.services.azure_openai import AzureOpenAIService
from app.services.gdm_results_service import gdm_results_service
from app.services.playbook_service import PlaybookService

logger = logging.getLogger(__name__)


class PlaybookGenerationService:
    """Generate AutoML playbooks grounded on a Global Data Model run."""

    def __init__(
        self,
        *,
        playbook_service: PlaybookService,
        llm: Optional[AzureOpenAIService] = None,
        gdm_results=gdm_results_service,
    ) -> None:
        self._playbook_service = playbook_service
        self._llm = llm or AzureOpenAIService()
        self._gdm_results = gdm_results

    @staticmethod
    def _slugify(text: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
        return cleaned or "automl-playbook"

    @staticmethod
    def _top_entities(results: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
        nodes = results.get("graph", {}).get("nodes", [])
        return sorted(nodes, key=lambda n: n.get("degree", 0), reverse=True)[:limit]

    def _build_context_snippet(
        self, results: Dict[str, Any], target_table: Optional[str]
    ) -> str:
        entities = self._top_entities(results)
        lines = []
        for node in entities:
            columns = node.get("columns", []) or []
            preview_cols = ", ".join(col.get("name") for col in columns[:6])
            lines.append(
                f"- {node.get('label')} ({node.get('type')}) · cols: {preview_cols}"
            )
        relationships = results.get("graph", {}).get("edges", []) or []
        rel_sample = relationships[:6]
        rel_lines = [
            f"- {rel.get('source')} -> {rel.get('target')} ({rel.get('label')})"
            for rel in rel_sample
        ]
        target_hint = f"\nTarget table preference: {target_table}" if target_table else ""
        return (
            "Key entities:\n"
            + "\n".join(lines)
            + "\n\nRelationships (sample):\n"
            + ("\n".join(rel_lines) or "None detected")
            + target_hint
        )

    def _fallback_playbook(
        self,
        *,
        job_id: str,
        use_case: str,
        task: Optional[str],
        target_table: Optional[str],
        target_column: Optional[str],
        metric: Optional[str],
        time_limit_minutes: Optional[int],
        max_trials: Optional[int],
    ) -> Dict[str, Any]:
        slug = self._slugify(use_case)
        playbook_id = f"{slug}-automl"
        resolved_task = (task or "classification").lower()
        default_metric = metric or (
            "AUC_weighted"
            if resolved_task == "classification"
            else "r2_score"
        )
        return {
            "id": playbook_id,
            "name": use_case.title(),
            "description": f"AutoML playbook for '{use_case}' derived from GDM job {job_id}.",
            "domain": "custom",
            "required_inputs": ["training_data", "target_column"],
            "steps": [
                {
                    "type": "automl",
                    "params": {
                        "task": resolved_task,
                        "metric": default_metric,
                        "time_limit_minutes": time_limit_minutes or 45,
                        "max_trials": max_trials or 12,
                        "experiment_name": f"{slug}-exp",
                        "job_name": slug,
                        "target_table": target_table,
                        "target_column": target_column,
                        "tags": {
                            "gdm_job_id": job_id,
                            "use_case": use_case,
                        },
                    },
                }
            ],
        }

    def _normalize_playbook(
        self,
        draft: Dict[str, Any],
        *,
        job_id: str,
        use_case: str,
        task: Optional[str],
        target_table: Optional[str],
        target_column: Optional[str],
        metric: Optional[str],
        time_limit_minutes: Optional[int],
        max_trials: Optional[int],
    ) -> Dict[str, Any]:
        """Ensure required fields exist and add guardrails."""
        slug = self._slugify(draft.get("id") or draft.get("name") or use_case)
        resolved_task = (draft.get("task") or task or "classification").lower()
        default_metric = (
            draft.get("metric")
            or metric
            or ("AUC_weighted" if resolved_task == "classification" else "r2_score")
        )
        steps = draft.get("steps") if isinstance(draft.get("steps"), list) else None
        playbook = {
            "id": slug,
            "name": draft.get("name") or use_case.title(),
            "description": draft.get("description")
            or f"AutoML playbook for '{use_case}' grounded on GDM job {job_id}.",
            "domain": draft.get("domain") or draft.get("industry") or "custom",
            "required_inputs": draft.get("required_inputs") or ["training_data", "target_column"],
            "steps": steps
            or [
                {
                    "type": "automl",
                    "params": {},
                }
            ],
        }

        # Normalize the first AutoML step
        automl_steps = [s for s in playbook["steps"] if s.get("type") == "automl"]
        if not automl_steps:
            playbook["steps"].insert(
                0, {"type": "automl", "params": {}}
            )
            automl_steps = [playbook["steps"][0]]

        step = automl_steps[0]
        params = step.get("params", {})
        params.setdefault("task", resolved_task)
        params.setdefault("metric", default_metric)
        params.setdefault("time_limit_minutes", time_limit_minutes or 45)
        params.setdefault("max_trials", max_trials or 12)
        params.setdefault("target_table", target_table)
        params.setdefault("target_column", target_column)
        params.setdefault("experiment_name", f"{slug}-exp")
        params.setdefault("job_name", slug)
        existing_tags = params.get("tags") if isinstance(params.get("tags"), dict) else {}
        params["tags"] = {**existing_tags, "gdm_job_id": job_id, "use_case": use_case}
        step["params"] = params
        return playbook

    async def generate_from_gdm(
        self,
        *,
        job_id: str,
        use_case: str,
        task: Optional[str] = None,
        target_table: Optional[str] = None,
        target_column: Optional[str] = None,
        metric: Optional[str] = None,
        time_limit_minutes: Optional[int] = None,
        max_trials: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create and persist a playbook using GDM artifacts as grounding."""
        try:
            results = self._gdm_results.get_results(job_id)
        except Exception as exc:
            raise ValueError(f"GDM job {job_id} not found or incomplete") from exc
        if not results:
            raise ValueError(f"GDM job {job_id} not found")

        context_snippet = self._build_context_snippet(results, target_table)
        prompt = f"""
        You are a data architect designing an AutoML playbook for Azure ML.

        Use case: {use_case}
        Preferred ML task: {task or "classification/regression based on context"}
        Target hints: table={target_table or "?"}, column={target_column or "?"}
        Context from global data model (summarized):
        {context_snippet}

        Return a JSON object with these keys:
        - id (slug, lowercase, hyphenated)
        - name (human friendly)
        - description
        - domain (single word or short phrase)
        - required_inputs (array, include training_data and target_column)
        - steps: array with at least one item:
            {{"type": "automl", "params": {{
                "task": "...",
                "metric": "...",
                "time_limit_minutes": number,
                "max_trials": number,
                "target_table": "...",
                "target_column": "...",
                "experiment_name": "...",
                "job_name": "..."
            }}}}
        Keep the response concise and valid JSON only.
        """
        draft: Dict[str, Any]
        try:
            llm_response = await self._llm.generate_response(
                prompt, response_format="json"
            )
            if isinstance(llm_response, str):
                draft = json.loads(llm_response)
            else:
                draft = llm_response
        except Exception as exc:
            logger.warning(
                "LLM playbook generation failed; using fallback. Error: %s", exc
            )
            draft = self._fallback_playbook(
                job_id=job_id,
                use_case=use_case,
                task=task,
                target_table=target_table,
                target_column=target_column,
                metric=metric,
                time_limit_minutes=time_limit_minutes,
                max_trials=max_trials,
            )

        playbook = self._normalize_playbook(
            draft,
            job_id=job_id,
            use_case=use_case,
            task=task,
            target_table=target_table,
            target_column=target_column,
            metric=metric,
            time_limit_minutes=time_limit_minutes,
            max_trials=max_trials,
        )
        self._playbook_service.save_playbook(playbook)
        summary = {
            "id": playbook["id"],
            "name": playbook["name"],
            "description": playbook.get("description"),
            "domain": playbook.get("domain"),
            "required_inputs": playbook.get("required_inputs", []),
            "steps": [s.get("type") for s in playbook.get("steps", [])],
            "from_gdm_job": job_id,
            "defaults": {
                "target_column": playbook.get("steps", [{}])[0].get("params", {}).get("target_column"),
                "target_table": playbook.get("steps", [{}])[0].get("params", {}).get("target_table"),
                "metric": playbook.get("steps", [{}])[0].get("params", {}).get("metric"),
                "time_limit_minutes": playbook.get("steps", [{}])[0].get("params", {}).get("time_limit_minutes"),
                "max_trials": playbook.get("steps", [{}])[0].get("params", {}).get("max_trials"),
                "task": playbook.get("steps", [{}])[0].get("params", {}).get("task"),
            },
        }
        return summary
