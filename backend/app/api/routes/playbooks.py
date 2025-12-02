from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.playbook_service import PlaybookService
from app.services.playbook_generation_service import PlaybookGenerationService
from app.services.business_metrics_service import business_metrics_service
from app.services.automl_insights_service import AutoMLInsightsService

router = APIRouter()
playbook_service = PlaybookService()
automl_service = playbook_service.automl_service
playbook_generation_service = PlaybookGenerationService(playbook_service=playbook_service)
insights_service = AutoMLInsightsService()


class PlaybookRunRequest(BaseModel):
    playbook_id: str = Field(..., description="Playbook identifier")
    params: Dict[str, Any] = Field(default_factory=dict)
    skip_validation: bool = Field(default=False, description="Skip validation before running")


class PlaybookRunResponse(BaseModel):
    status: str
    job_id: Optional[str] = None
    playbook_id: Optional[str] = None
    playbook_hash: Optional[str] = None
    summary: Optional[str] = None
    error: Optional[str] = None
    validation: Optional[Dict[str, Any]] = None


class PlaybookValidateRequest(BaseModel):
    playbook_id: str = Field(..., description="Playbook identifier")
    params: Dict[str, Any] = Field(default_factory=dict)
    check_leakage: bool = Field(default=True, description="Run leakage detection")
    sample_size: int = Field(default=10000, ge=100, le=100000, description="Sample size for validation")


class PlaybookValidateResponse(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    leakage_risks: List[Dict[str, Any]] = Field(default_factory=list)
    schema_issues: List[Dict[str, Any]] = Field(default_factory=list)
    row_count: Optional[int] = None
    feature_count: Optional[int] = None
    target_distribution: Optional[Dict[str, Any]] = None
    data_readiness: str = "review_needed"


class PlaybookFromGDMRequest(BaseModel):
    job_id: str = Field(..., description="GDM job id to ground the playbook")
    use_case: str = Field(..., description="Business problem or objective")
    task: Optional[str] = Field(None, description="Preferred ML task (classification/regression/forecasting/clustering/anomaly)")
    target_table: Optional[str] = Field(None, description="Table that contains the target column")
    target_column: Optional[str] = Field(None, description="Column to predict")
    metric: Optional[str] = Field(None, description="Primary metric for AutoML")
    time_limit_minutes: Optional[int] = Field(None, ge=5, le=480)
    max_trials: Optional[int] = Field(None, ge=1, le=100)


class FullResultsRequest(BaseModel):
    include_predictions: bool = Field(default=True, description="Include sample predictions")
    predictions_limit: int = Field(default=100, ge=10, le=1000, description="Max predictions to include")
    compute_business_metrics: bool = Field(default=True, description="Compute business metrics for classification")
    generate_interpretation: bool = Field(default=True, description="Generate GPT-5 interpretation")


@router.get("/playbooks", response_model=List[Dict[str, Any]])
async def list_playbooks():
    """Return all available playbooks."""
    return playbook_service.list_playbooks()


@router.get("/playbooks/{playbook_id}", response_model=Dict[str, Any])
async def get_playbook(playbook_id: str):
    """Get a specific playbook by ID."""
    playbook = playbook_service.get_playbook(playbook_id)
    if not playbook:
        raise HTTPException(status_code=404, detail=f"Playbook '{playbook_id}' not found")
    return playbook


@router.post("/playbooks/validate", response_model=PlaybookValidateResponse)
async def validate_playbook(request: PlaybookValidateRequest):
    """
    Validate a playbook configuration before execution.

    Checks:
    - Schema validation (columns exist, types match)
    - Leakage detection (post-event features, high correlations)
    - Data quality (sufficient rows, class balance)
    - Metric compatibility with problem type
    """
    validation_result, _ = await playbook_service.validate_playbook(
        playbook_id=request.playbook_id,
        params=request.params,
        check_leakage=request.check_leakage,
        sample_size=request.sample_size
    )

    return PlaybookValidateResponse(
        valid=validation_result.valid,
        errors=validation_result.errors,
        warnings=validation_result.warnings,
        leakage_risks=[r.model_dump() for r in validation_result.leakage_risks],
        schema_issues=[i.model_dump() for i in validation_result.schema_issues],
        row_count=validation_result.row_count,
        feature_count=validation_result.feature_count,
        target_distribution=validation_result.target_distribution,
        data_readiness=validation_result.data_readiness.value
    )


@router.post("/playbooks/run", response_model=PlaybookRunResponse)
async def run_playbook(request: PlaybookRunRequest):
    """
    Execute a playbook with optional validation.

    If skip_validation is False (default), the playbook is validated first.
    Validation errors will cause the run to fail.
    """
    if request.skip_validation:
        result = await playbook_service.run_playbook(request.playbook_id, request.params)
    else:
        result = await playbook_service.run_playbook_with_validation(
            playbook_id=request.playbook_id,
            params=request.params,
            skip_validation=request.skip_validation
        )

    if result.get("status") == "failed":
        error_response = {
            "status": "failed",
            "error": result.get("error", "Playbook run failed"),
        }
        if "validation_errors" in result:
            error_response["validation"] = {
                "errors": result.get("validation_errors", []),
                "warnings": result.get("validation_warnings", []),
                "leakage_risks": result.get("leakage_risks", []),
            }
        raise HTTPException(status_code=400, detail=error_response)

    return PlaybookRunResponse(
        status=result.get("status", "submitted"),
        job_id=result.get("job_id"),
        playbook_id=result.get("playbook_id"),
        playbook_hash=result.get("playbook_hash"),
        summary=result.get("message"),
        validation=result.get("validation")
    )


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
    """Fetch AutoML job status/metrics (AutoGluon-backed)."""
    status = await automl_service.get_job_status(job_id)
    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail=status.get("error", "Job not found"))

    if status.get("status") == "failed" and status.get("error"):
        raise HTTPException(status_code=400, detail=status["error"])

    if status.get("status") == "completed":
        try:
            results = await automl_service.get_job_results(job_id)
            status["results"] = results
        except Exception:
            # Continue returning status even if results are unavailable
            pass

    return status


@router.post("/automl/{job_id}/full-results", response_model=Dict[str, Any])
async def get_full_results(job_id: str, request: FullResultsRequest):
    """
    Get complete AutoML results with business metrics and interpretation.

    Returns:
    - Basic results (leaderboard, feature importance, confusion matrix)
    - Business metrics (threshold analysis, capture curve, lift chart, gains)
    - GPT-5 interpretation (executive summary, recommended actions)
    """
    import numpy as np

    # Get basic results
    results = await automl_service.get_job_results(job_id)
    if results.get("status") == "not_found" or results.get("error"):
        raise HTTPException(
            status_code=404,
            detail=results.get("error", "Job not found or results unavailable")
        )

    response = {**results}

    # Compute business metrics for classification
    task = results.get("task", "").lower()
    if request.compute_business_metrics and task == "classification" and not response.get("threshold_analysis"):
        try:
            # Get predictions for business metrics
            predictions_sample = results.get("predictions_sample", [])

            if predictions_sample and len(predictions_sample) > 0:
                # Extract actual and predicted values for threshold analysis
                # This would require full predictions - for now, use sample
                class_labels = results.get("class_labels", [])

                if len(class_labels) == 2:
                    # Binary classification - compute threshold analysis
                    # Note: In production, this would use the full test set predictions
                    y_true = []
                    y_proba = []

                    for pred in predictions_sample:
                        actual = pred.get("actual")
                        probs = pred.get("probabilities", {})

                        if actual and probs:
                            # Get positive class probability
                            positive_class = class_labels[1] if len(class_labels) > 1 else "1"
                            prob = probs.get(str(positive_class), 0.5)
                            y_true.append(1 if str(actual) == str(positive_class) else 0)
                            y_proba.append(prob)

                    if len(y_true) >= 10:
                        y_true_arr = np.array(y_true)
                        y_proba_arr = np.array(y_proba)

                        # Compute threshold analysis
                        threshold_analysis = business_metrics_service.compute_threshold_analysis(
                            y_true_arr, y_proba_arr
                        )
                        response["threshold_analysis"] = threshold_analysis.model_dump()

                        # Compute gains summary
                        gains_summary = business_metrics_service.compute_gains_summary(
                            y_true_arr, y_proba_arr
                        )
                        response["gains_summary"] = gains_summary.model_dump()

        except Exception as e:
            # Don't fail the whole request if metrics computation fails
            response["business_metrics_error"] = str(e)

    # Generate GPT-5 interpretation
    if request.generate_interpretation:
        try:
            # Build problem-specific data for specialized tasks
            problem_specific_data = None
            task_type = results.get("task", "").lower()

            if task_type == "forecasting":
                problem_specific_data = {
                    "prediction_horizon": results.get("prediction_horizon"),
                    "evaluation_metrics": results.get("forecast_metrics", {}),
                }
            elif task_type == "clustering":
                problem_specific_data = {
                    "n_clusters": results.get("n_clusters"),
                    "silhouette_score": results.get("silhouette_score"),
                    "cluster_sizes": results.get("cluster_sizes", {}),
                    "cluster_statistics": results.get("cluster_statistics", []),
                }
            elif task_type == "anomaly":
                problem_specific_data = {
                    "anomaly_statistics": results.get("anomaly_statistics", {}),
                }

            # Use enhanced GPT-5 interpretation
            interpretation = await insights_service.generate_gpt5_interpretation(
                job_id=job_id,
                task=results.get("task", "classification"),
                target_column=results.get("target_column", ""),
                best_model=results.get("best_model", ""),
                best_score=results.get("best_score", 0.0),
                eval_metric=results.get("eval_metric", ""),
                feature_importance=results.get("feature_importance", {}),
                leaderboard=results.get("leaderboard", []),
                num_rows=results.get("num_rows_train", 0),
                num_features=results.get("num_features", 0),
                training_time=results.get("training_time_seconds", 0),
                confusion_matrix=results.get("confusion_matrix"),
                class_labels=results.get("class_labels"),
                threshold_analysis=response.get("threshold_analysis"),
                gains_summary=response.get("gains_summary"),
                problem_specific_data=problem_specific_data,
            )
            response["interpretation"] = interpretation.to_dict()
        except Exception as e:
            response["interpretation_error"] = str(e)

    return response


class InterpretRequest(BaseModel):
    business_context: Optional[str] = Field(None, description="Optional business context")


@router.post("/automl/{job_id}/interpret", response_model=Dict[str, Any])
async def generate_interpretation(job_id: str, request: Optional[InterpretRequest] = None):
    """Generate or regenerate GPT-5 interpretation for an AutoML job."""
    results = await automl_service.get_job_results(job_id)
    if results.get("status") == "not_found" or results.get("error"):
        raise HTTPException(
            status_code=404,
            detail=results.get("error", "Job not found")
        )

    business_context = request.business_context if request else None

    try:
        # Build problem-specific data
        problem_specific_data = None
        task_type = results.get("task", "").lower()

        if task_type == "forecasting":
            problem_specific_data = {
                "prediction_horizon": results.get("prediction_horizon"),
                "evaluation_metrics": results.get("forecast_metrics", {}),
            }
        elif task_type == "clustering":
            problem_specific_data = {
                "n_clusters": results.get("n_clusters"),
                "silhouette_score": results.get("silhouette_score"),
                "cluster_sizes": results.get("cluster_sizes", {}),
            }
        elif task_type == "anomaly":
            problem_specific_data = {
                "anomaly_statistics": results.get("anomaly_statistics", {}),
            }

        interpretation = await insights_service.generate_gpt5_interpretation(
            job_id=job_id,
            task=results.get("task", "classification"),
            target_column=results.get("target_column", ""),
            best_model=results.get("best_model", ""),
            best_score=results.get("best_score", 0.0),
            eval_metric=results.get("eval_metric", ""),
            feature_importance=results.get("feature_importance", {}),
            leaderboard=results.get("leaderboard", []),
            num_rows=results.get("num_rows_train", 0),
            num_features=results.get("num_features", 0),
            training_time=results.get("training_time_seconds", 0),
            confusion_matrix=results.get("confusion_matrix"),
            class_labels=results.get("class_labels"),
            business_context=business_context,
            problem_specific_data=problem_specific_data,
        )
        return {"job_id": job_id, "interpretation": interpretation.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
