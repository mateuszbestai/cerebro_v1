from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.playbook_service import PlaybookService
from app.services.automl_service import AutoMLService
from app.services.playbook_generation_service import PlaybookGenerationService

router = APIRouter()
playbook_service = PlaybookService()
automl_service = playbook_service.automl_service
playbook_generation_service = PlaybookGenerationService(playbook_service=playbook_service)


class PlaybookRunRequest(BaseModel):
    playbook_id: str = Field(..., description="Playbook identifier")
    params: Dict[str, Any] = Field(default_factory=dict)


class PlaybookRunResponse(BaseModel):
    status: str
    job_id: Optional[str] = None
    playbook_id: Optional[str] = None
    summary: Optional[str] = None
    error: Optional[str] = None


class PlaybookFromGDMRequest(BaseModel):
    job_id: str = Field(..., description="GDM job id to ground the playbook")
    use_case: str = Field(..., description="Business problem or objective")
    task: Optional[str] = Field(None, description="Preferred ML task (classification/regression/forecasting)")
    target_table: Optional[str] = Field(None, description="Table that contains the target column")
    target_column: Optional[str] = Field(None, description="Column to predict")
    metric: Optional[str] = Field(None, description="Primary metric for AutoML")
    time_limit_minutes: Optional[int] = Field(None, ge=5, le=240)
    max_trials: Optional[int] = Field(None, ge=1, le=60)


@router.get("/playbooks", response_model=List[Dict[str, Any]])
async def list_playbooks():
    """Return all available playbooks."""
    return playbook_service.list_playbooks()


@router.post("/playbooks/run", response_model=PlaybookRunResponse)
async def run_playbook(request: PlaybookRunRequest):
    """Execute a playbook. Currently supports AutoML steps."""
    result = await playbook_service.run_playbook(request.playbook_id, request.params)
    if result.get("status") == "failed":
        raise HTTPException(status_code=400, detail=result.get("error", "Playbook run failed"))
    return PlaybookRunResponse(**result)


@router.post("/playbooks/generate", response_model=Dict[str, Any])
async def generate_playbook(request: PlaybookFromGDMRequest):
    """Generate an AutoML playbook grounded on a Global Data Model job."""
    try:
        result = await playbook_generation_service.generate_from_gdm(
            job_id=request.job_id,
            use_case=request.use_case,
            task=request.task,
            target_table=request.target_table,
            target_column=request.target_column,
            metric=request.metric,
            time_limit_minutes=request.time_limit_minutes,
            max_trials=request.max_trials,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/automl/{job_id}", response_model=Dict[str, Any])
async def get_automl_job(job_id: str):
    """Fetch AutoML job status/metrics."""
    result = await automl_service.get_job(job_id)
    if result.get("status") == "failed" and result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result
