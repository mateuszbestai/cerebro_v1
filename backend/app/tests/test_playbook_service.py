import pytest

from app.services.playbook_service import PlaybookService


def test_playbook_registry_loads_sample():
    service = PlaybookService()
    playbooks = service.list_playbooks()
    assert any(pb["id"] == "churn_watch" for pb in playbooks)


@pytest.mark.asyncio
async def test_playbook_run_stub_mode_returns_job_id():
    service = PlaybookService()
    result = await service.run_playbook(
        "churn_watch",
        {"training_data": "azureml://fake/path/data.csv", "target_column": "churned"},
    )
    assert result["job_id"]
    assert result["status"] in {"completed", "submitted", "failed"}
