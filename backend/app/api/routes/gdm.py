from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict
from typing import Any, Dict, List, Optional

from app.services.gdm_service import gdm_service, GDMJob
from app.services.gdm_results_service import gdm_results_service

router = APIRouter()


class APIModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class GDMArtifact(APIModel):
    name: str
    download_url: str
    path: str
    relative_path: Optional[str] = None


class UploadedDataset(APIModel):
    name: str = Field(..., description="Name of the uploaded CSV dataset")
    columns: Optional[List[str]] = Field(default=None, description="Column names if known")
    rows: List[Dict[str, Any]] = Field(default_factory=list, description="Sampled rows")
    row_count: Optional[int] = Field(default=None, description="Approximate total rows in source file")


class GDMCreateRequest(APIModel):
    database_id: Optional[str] = Field(
        default=None, description="Active database connection identifier (optional when using dataset)"
    )
    connection: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional connection payload if the database is not already connected",
    )
    model: Optional[str] = Field(
        default=None,
        description="Preferred model id (gpt-5 or gpt-4.1). Defaults follow service heuristics.",
    )
    dataset: Optional[UploadedDataset] = Field(
        default=None,
        description="Uploaded CSV dataset to build a Global Data Model without a live database",
    )


class GDMCreateResponse(APIModel):
    job_id: str
    model_used: str
    status: str
    warnings: List[str] = Field(default_factory=list)


class GDMStatusResponse(APIModel):
    job_id: str
    status: str
    step: str
    progress: int
    message: str
    model_used: str
    logs: List[Dict[str, Any]]
    warnings: List[str]
    artifacts: List[GDMArtifact] = Field(default_factory=list)
    summary: Optional[Dict[str, Any]] = None
    completed_at: Optional[str] = None


class EntityColumn(APIModel):
    name: str
    type: Optional[str] = None
    nullable: Optional[bool] = None
    max_length: Optional[int] = None
    default: Optional[str] = None
    is_primary_key: Optional[bool] = None
    semantic_type: Optional[str] = None
    semantic_description: Optional[str] = None


class FeatureAvailability(APIModel):
    table: Optional[str] = None
    column: str
    reason: str


class AutomlTarget(APIModel):
    table: str
    column: str
    task: str
    reason: str
    semantic_type: Optional[str] = None
    business_process: Optional[str] = None
    row_count: Optional[int] = None
    feature_time: Optional[FeatureAvailability] = None


class BusinessProcessHint(APIModel):
    table: str
    process: str
    confidence: float
    reason: str


class KPISignal(APIModel):
    table: str
    column: str
    semantic_type: Optional[str] = None
    definition: Optional[str] = None


class FeatureSuggestion(APIModel):
    table: str
    features: List[str]
    reason: str
    feature_time: Optional[FeatureAvailability] = None


class ColumnSemantic(APIModel):
    table: str
    column: str
    semantic_type: str
    description: Optional[str] = None


class AutomlGuidance(APIModel):
    recommended_targets: List[AutomlTarget] = Field(default_factory=list)
    feature_availability: List[FeatureAvailability] = Field(default_factory=list)
    business_processes: List[BusinessProcessHint] = Field(default_factory=list)
    kpi_columns: List[KPISignal] = Field(default_factory=list)
    feature_suggestions: List[FeatureSuggestion] = Field(default_factory=list)
    semantic_columns: List[ColumnSemantic] = Field(default_factory=list)


class GraphNode(APIModel):
    id: str
    label: str
    schema: str
    name: str
    type: str
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    degree: int
    position: Dict[str, float]
    columns: List[EntityColumn] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    profile: Optional[Dict[str, Any]] = None
    business_process: Optional[str] = None
    feature_time: Optional[FeatureAvailability] = None
    kpi_columns: List[str] = Field(default_factory=list)
    target_recommendations: List[AutomlTarget] = Field(default_factory=list)


class GraphEdge(APIModel):
    id: str
    source: str
    target: str
    label: str
    confidence: Optional[float] = None
    strategy: Optional[str] = None


class GraphPayload(APIModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class ResultsStats(APIModel):
    facts: int
    dimensions: int
    avg_degree: float
    max_degree: int
    isolated_nodes: int


class TimelineItem(APIModel):
    id: str
    label: str
    description: str
    timestamp: Optional[str] = None
    status: str


class GDMResultsResponse(APIModel):
    job_id: str
    database_id: Optional[str] = None
    model_used: Optional[str] = None
    completed_at: Optional[str] = None
    graph: GraphPayload
    entity_count: int
    relationship_count: int
    summary: Optional[Dict[str, Any]] = None
    artifacts: List[GDMArtifact]
    missing_artifacts: List[str]
    warnings: List[str] = Field(default_factory=list)
    timeline: List[TimelineItem]
    stats: ResultsStats
    glossary_terms: int
    ai_usage_enabled: bool
    relationship_overview: Dict[str, int]
    automl_guidance: Optional[AutomlGuidance] = None


class GDMNaturalLanguageSummaryResponse(APIModel):
    job_id: str
    entity_count: int
    relationship_count: int
    summary: str
    top_entities: List[str] = Field(default_factory=list)
    notable_measures: List[str] = Field(default_factory=list)


class GDMInsight(APIModel):
    id: str
    title: str
    value: str
    description: str
    severity: str
    affected_nodes: List[str] = Field(default_factory=list)
    supporting: Optional[List[Dict[str, Any]]] = None
    details: Optional[List[Dict[str, Any]]] = None


class RelationshipRecordModel(APIModel):
    id: str
    from_table: str
    from_column: str
    to_table: str
    to_column: Optional[str] = None
    confidence: float
    strategy: Optional[str] = None
    status: str
    evidence: Optional[str] = None
    preview_sql: Optional[str] = None
    test_status: Optional[Dict[str, Any]] = None
    last_tested: Optional[str] = None


class RelationshipReviewResponse(APIModel):
    job_id: str
    confirmed: List[RelationshipRecordModel]
    candidates: List[RelationshipRecordModel]


class UseForAIRequest(APIModel):
    job_id: str
    enable: bool


class UseForAIResponse(APIModel):
    job_id: str
    enabled: bool
    updated_at: Optional[str] = None


class RelationshipConfirmRequest(APIModel):
    job_id: str
    relationship_ids: List[str] = Field(default_factory=list)


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
            dataset=request.dataset.model_dump() if request.dataset else None,
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
    job = gdm_service.get_status(job_id)
    if job and job.artifacts:
        artifact = next((a for a in job.artifacts if a["name"] == artifact_name), None)
        if artifact:
            return FileResponse(artifact["path"], filename=artifact_name)
    try:
        path = gdm_results_service.find_artifact_path(job_id, artifact_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(str(path), filename=artifact_name)


@router.get("/results/{job_id}", response_model=GDMResultsResponse)
async def get_gdm_results(job_id: str):
    """Return aggregated model metadata, graph payload, and artifact manifest."""
    try:
        payload = await run_in_threadpool(gdm_results_service.get_results, job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.get("/nl_summary/{job_id}", response_model=GDMNaturalLanguageSummaryResponse)
async def get_gdm_narrative(job_id: str):
    """Return the natural-language narrative for a finished model."""
    try:
        payload = await run_in_threadpool(gdm_results_service.get_narrative_summary, job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.get("/insights/{job_id}", response_model=List[GDMInsight])
async def get_gdm_insights(job_id: str):
    """Return quick insight cards derived from the global model."""
    try:
        payload = await run_in_threadpool(gdm_results_service.get_insights, job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.get("/relationships/{job_id}", response_model=RelationshipReviewResponse)
async def get_relationship_review(job_id: str):
    """Return confirmed and candidate relationships for review."""
    try:
        payload = await run_in_threadpool(gdm_results_service.get_relationship_review, job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.post("/relationships/confirm", response_model=RelationshipReviewResponse)
async def confirm_relationships(request: RelationshipConfirmRequest):
    """Mark one or more relationship candidates as confirmed."""
    try:
        payload = await run_in_threadpool(
            gdm_results_service.confirm_relationships, request.job_id, request.relationship_ids
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.post("/use-for-ai", response_model=UseForAIResponse)
async def set_use_for_ai(request: UseForAIRequest):
    """Enable or disable usage of this model as context for AI queries."""
    try:
        payload = await run_in_threadpool(gdm_results_service.set_use_for_ai, request.job_id, request.enable)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.get("/use-for-ai/{job_id}", response_model=UseForAIResponse)
async def get_use_for_ai(job_id: str):
    """Return current AI usage flag for the requested job."""
    state = await run_in_threadpool(gdm_results_service.get_use_for_ai, job_id)
    if not state:
        return {"job_id": job_id, "enabled": False, "updated_at": None}
    return state
