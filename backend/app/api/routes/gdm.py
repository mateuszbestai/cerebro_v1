from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from app.services.gdm_service import gdm_service, GDMJob

router = APIRouter()


class GDMCreateRequest(BaseModel):
    database_id: str = Field(..., description="Active database connection identifier")
    connection: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional connection payload if the database is not already connected",
    )
    model: Optional[str] = Field(
        default=None,
        description="Preferred model id (gpt-5 or gpt-4.1). Defaults follow service heuristics.",
    )


class GDMCreateResponse(BaseModel):
    job_id: str
    model_used: str
    status: str
    warnings: List[str] = Field(default_factory=list)


class GDMStatusResponse(BaseModel):
    job_id: str
    status: str
    step: str
    progress: int
    message: str
    model_used: str
    logs: List[Dict[str, Any]]
    warnings: List[str]
    artifacts: List[Dict[str, str]] = Field(default_factory=list)
    summary: Optional[Dict[str, Any]] = None
    completed_at: Optional[str] = None


@router.post("/create", response_model=GDMCreateResponse)
async def create_gdm(request: GDMCreateRequest):
    """
    Start asynchronous generation of the Global Data Model for the selected database.
    """
    try:
        result = await gdm_service.start_job(
            database_id=request.database_id,
            user_model=request.model,
            connection_payload=request.connection,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return GDMCreateResponse(**result)


def _job_or_404(job_id: str) -> GDMJob:
    job = gdm_service.get_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/status/{job_id}", response_model=GDMStatusResponse)
async def get_gdm_status(job_id: str):
    """Return current job state, progress, and produced artifacts."""
    job = _job_or_404(job_id)
    return GDMStatusResponse(
        job_id=job.job_id,
        status=job.status,
        step=job.step,
        progress=job.progress,
        message=job.message,
        model_used=job.model_used,
        logs=job.logs,
        warnings=job.warnings,
        artifacts=job.artifacts,
        summary=job.summary,
        completed_at=job.completed_at,
    )


@router.get("/artifact/{job_id}/{artifact_name}")
async def download_gdm_artifact(job_id: str, artifact_name: str):
    """Download generated artifacts such as global_model.json or ER diagram."""
    job = _job_or_404(job_id)
    if not job.artifacts:
        raise HTTPException(status_code=404, detail="Artifacts not available")

    artifact = next((a for a in job.artifacts if a["name"] == artifact_name), None)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    path = artifact["path"]
    return FileResponse(path, filename=artifact_name)
