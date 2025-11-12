import json
from pathlib import Path
from types import SimpleNamespace
from typing import Tuple

import pytest

from app.services.gdm_results_service import GDMResultsService


class DummyGDMService:
    """Minimal stub that mimics the portions of GDMService used by the results service."""

    def __init__(self, output_root: Path, job: SimpleNamespace):
        self.output_root = output_root
        self._job = job

    def get_status(self, job_id: str):
        if self._job and self._job.job_id == job_id:
            return self._job
        return None


@pytest.fixture()
def seeded_service(tmp_path) -> Tuple[GDMResultsService, str]:
    job_id = "job-test"
    job_dir = tmp_path / "demo-db" / "gpt-5" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    entities = [
        {
            "schema": "dbo",
            "name": "fact_orders",
            "row_count": 1200,
            "columns": [
                {"name": "order_id", "type": "int", "is_primary_key": True},
                {"name": "customer_id", "type": "int", "is_primary_key": False},
                {"name": "total_amount", "type": "decimal", "is_primary_key": False},
            ],
        },
        {
            "schema": "dbo",
            "name": "dim_customers",
            "row_count": 450,
            "columns": [
                {"name": "customer_id", "type": "int", "is_primary_key": True},
                {"name": "email_address", "type": "nvarchar", "is_primary_key": False},
            ],
        },
    ]
    relationships = [
        {
            "from_table": "dbo.fact_orders",
            "from_column": "customer_id",
            "to_table": "dbo.dim_customers",
            "to_column": "customer_id",
            "confidence": 0.92,
            "strategy": "naming_convention",
        }
    ]
    profiles = {
        "dbo.fact_orders": {
            "row_count": 1200,
            "sample_rows": [{"order_id": 1, "updated_at": "2024-01-01T00:00:00Z"}],
        }
    }
    summary = {"glossary": {"Orders": {"description": "test"}}}
    global_model = {
        "job_id": job_id,
        "database_id": "demo-db",
        "generated_at": "2024-01-01T00:00:00Z",
        "model_used": "gpt-5",
        "entities": entities,
        "relationships": relationships,
        "profiles": profiles,
        "summary": summary,
    }
    (job_dir / "global_model.json").write_text(json.dumps(global_model, indent=2))
    (job_dir / "glossary.json").write_text(json.dumps(summary["glossary"]))
    (job_dir / "relationships.csv").write_text("from_table,from_column,to_table,to_column,confidence,strategy\n")
    (job_dir / "model.mmd").write_text("erDiagram")
    (job_dir / "conformed_views.sql").write_text("-- sql")

    job = SimpleNamespace(
        job_id=job_id,
        database_id="demo-db",
        model_used="gpt-5",
        completed_at="2024-01-01T00:00:00Z",
        status="completed",
        step="completed",
        logs=[
            {"timestamp": "2024-01-01T00:00:00Z", "step": "metadata_harvest", "message": "harvest"},
            {"timestamp": "2024-01-01T00:05:00Z", "step": "completed", "message": "done"},
        ],
        warnings=[],
        artifacts=[],
        output_dir=str(job_dir),
    )
    dummy_service = DummyGDMService(tmp_path, job)
    service = GDMResultsService(gdm_service_ref=dummy_service, base_dir=tmp_path)
    return service, job_id


def test_results_payload_exposes_graph_and_stats(seeded_service):
    service, job_id = seeded_service
    payload = service.get_results(job_id)
    assert payload["entity_count"] == 2
    assert payload["graph"]["nodes"][0]["position"]
    assert payload["stats"]["avg_degree"] >= 0


def test_insights_capture_missing_foreign_keys(seeded_service):
    service, job_id = seeded_service
    insights = service.get_insights(job_id)
    ids = {item["id"] for item in insights}
    assert "missing_foreign_keys" in ids
    assert "pii_columns" in ids


def test_confirm_relationships_moves_records(seeded_service):
    service, job_id = seeded_service
    review = service.get_relationship_review(job_id)
    assert review["candidates"]
    rel_id = review["candidates"][0]["id"]
    updated = service.confirm_relationships(job_id, [rel_id])
    assert any(rel["id"] == rel_id for rel in updated["confirmed"])


def test_use_for_ai_state_persists(seeded_service):
    service, job_id = seeded_service
    service.set_use_for_ai(job_id, True)
    state = service.get_use_for_ai(job_id)
    assert state and state["enabled"] is True
