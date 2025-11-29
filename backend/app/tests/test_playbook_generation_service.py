import pytest

from app.services.playbook_generation_service import PlaybookGenerationService
from app.services.playbook_service import PlaybookService


class StubGDMResults:
    def get_results(self, job_id: str):
        return {
            "graph": {
                "nodes": [
                    {
                        "id": "customers",
                        "label": "customers",
                        "type": "table",
                        "columns": [{"name": "customer_id"}, {"name": "churned"}],
                        "degree": 2,
                    }
                ],
                "edges": [],
            }
        }


class StubLLM:
    async def generate_response(self, *args, **kwargs):
        return {
            "id": "gdm-demo",
            "name": "GDM Demo Playbook",
            "description": "Demo playbook from stub GDM.",
            "domain": "test",
            "required_inputs": ["training_data", "target_column"],
            "steps": [
                {
                    "type": "automl",
                    "params": {"task": "classification", "metric": "accuracy"},
                }
            ],
        }


@pytest.mark.asyncio
async def test_generate_playbook_from_gdm_persists(tmp_path):
    playbook_dir = tmp_path / "playbooks"
    service = PlaybookService(playbook_dir=playbook_dir)
    generator = PlaybookGenerationService(
        playbook_service=service, llm=StubLLM(), gdm_results=StubGDMResults()
    )

    result = await generator.generate_from_gdm(job_id="job-123", use_case="demo objective")

    assert result["id"] == "gdm-demo"
    assert result["defaults"]["target_column"] is not None
    assert (playbook_dir / "gdm-demo.yaml").exists()
    cached = service.list_playbooks()
    assert any(pb["id"] == "gdm-demo" for pb in cached)
