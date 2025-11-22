import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from app.services.automl_service import AutoMLService

logger = logging.getLogger(__name__)


class PlaybookService:
    """Loads playbook definitions and orchestrates execution steps."""

    def __init__(self, playbook_dir: Optional[Path] = None) -> None:
        base_dir = Path(__file__).resolve().parents[2]
        self.playbook_dir = playbook_dir or base_dir / "reports" / "playbooks"
        self.automl_service = AutoMLService()
        self._playbooks_cache: Dict[str, Dict[str, Any]] = {}
        self._load_playbooks()

    def _load_playbooks(self) -> None:
        if not self.playbook_dir.exists():
            logger.warning("Playbook directory not found: %s", self.playbook_dir)
            return
        for path in self.playbook_dir.glob("*.yaml"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if data and "id" in data:
                        self._playbooks_cache[data["id"]] = data
            except Exception as exc:
                logger.error("Failed to load playbook %s: %s", path, exc)

    def list_playbooks(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": pb.get("id"),
                "name": pb.get("name"),
                "description": pb.get("description"),
                "domain": pb.get("domain"),
                "required_inputs": pb.get("required_inputs", []),
                "steps": [s.get("type") for s in pb.get("steps", [])],
            }
            for pb in self._playbooks_cache.values()
        ]

    def get_playbook(self, playbook_id: str) -> Optional[Dict[str, Any]]:
        return self._playbooks_cache.get(playbook_id)

    async def run_playbook(self, playbook_id: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Currently supports AutoML steps; can be extended for SQL/report steps."""
        playbook = self.get_playbook(playbook_id)
        if not playbook:
            return {"status": "failed", "error": "playbook_not_found"}

        automl_steps = [s for s in playbook.get("steps", []) if s.get("type") == "automl"]
        if not automl_steps:
            return {"status": "failed", "error": "no_automl_step"}

        step = automl_steps[0]
        merged_params = {**step.get("params", {}), **(params or {})}

        required_fields = ["target_column", "training_data"]
        missing = [f for f in required_fields if not merged_params.get(f)]
        if missing:
            return {"status": "failed", "error": f"missing_fields: {', '.join(missing)}"}

        payload = {
            "task": merged_params.get("task", "classification"),
            "target_column": merged_params["target_column"],
            "training_data": merged_params["training_data"],
            "validation_data": merged_params.get("validation_data"),
            "metric": merged_params.get("metric"),
            "time_limit_minutes": merged_params.get("time_limit_minutes", 30),
            "max_trials": merged_params.get("max_trials", 10),
            "compute_name": merged_params.get("compute_name"),
            "experiment_name": merged_params.get("experiment_name"),
            "name": merged_params.get("job_name"),
            "tags": {"playbook": playbook_id, "domain": playbook.get("domain", "general")},
        }

        submission = await self.automl_service.submit_job(payload)
        return {
            "status": submission.get("status", "submitted"),
            "job_id": submission.get("job_id"),
            "playbook_id": playbook_id,
            "summary": submission.get("summary"),
        }
