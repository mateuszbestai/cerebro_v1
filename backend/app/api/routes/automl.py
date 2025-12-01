"""
AutoML API Routes

Provides endpoints for AutoGluon-based AutoML functionality.
Designed for business users with simple wizard-style interface.
"""

import logging
import math
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from app.services.autogluon_service import autogluon_service, PRESET_CONFIG, Preset, METRIC_MAPPING
from app.services.automl_insights_service import automl_insights_service
from app.api.routes.database import active_connections

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/automl", tags=["AutoML"])


def clean_nan_values(obj: Any) -> Any:
    """Recursively replace NaN, inf, and -inf with None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: clean_nan_values(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan_values(item) for item in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


# Request/Response Models

class AutoMLStartRequest(BaseModel):
    """Request to start an AutoML job."""
    task: str = Field(default="classification", description="ML task: classification or regression")
    target_column: str = Field(..., description="Column to predict")

    # Data source
    source: str = Field(..., description="Data source: database, gdm, or file")
    source_config: Dict[str, Any] = Field(..., description="Source configuration")

    # Training config
    preset: str = Field(default="balanced", description="Training preset: quick, balanced, or thorough")
    excluded_columns: List[str] = Field(default_factory=list, description="Columns to exclude")
    eval_metric: Optional[str] = Field(default=None, description="Evaluation metric")
    holdout_frac: float = Field(default=0.2, description="Validation holdout fraction")
    time_limit: Optional[int] = Field(default=None, description="Override time limit (seconds)")

    # Metadata
    job_name: Optional[str] = Field(default=None, description="Custom job name")
    tags: Dict[str, str] = Field(default_factory=dict, description="Job tags")


class AutoMLStartResponse(BaseModel):
    """Response from starting an AutoML job."""
    job_id: Optional[str] = None
    status: str
    error: Optional[str] = None


class AutoMLStatusResponse(BaseModel):
    """Job status response."""
    job_id: str
    status: str
    progress_pct: int
    current_step: str
    models_trained: int
    best_model: Optional[str] = None
    best_score: Optional[float] = None
    elapsed_seconds: int
    estimated_remaining: Optional[int] = None
    log_messages: List[str]
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class AutoMLCancelResponse(BaseModel):
    """Cancel response."""
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class PredictRequest(BaseModel):
    """Prediction request."""
    data: List[Dict[str, Any]] = Field(..., description="Data rows to predict")


class PresetInfo(BaseModel):
    """Preset information."""
    name: str
    time_limit: int
    description: str


class MetricInfo(BaseModel):
    """Metric information."""
    name: str
    display_name: str
    task: str
    description: str


# Helper Functions

def _load_data_from_source(source: str, source_config: Dict[str, Any]) -> pd.DataFrame:
    """Load data from various sources."""
    if source == "database":
        connection_id = source_config.get("connection_id")
        if not connection_id or connection_id not in active_connections:
            raise ValueError(f"Database connection '{connection_id}' not found")

        engine = active_connections[connection_id]["engine"]
        table_name = source_config.get("table_name")
        schema_name = source_config.get("schema_name", "dbo")
        query = source_config.get("query")

        if query:
            df = pd.read_sql(query, engine)
        elif table_name:
            qualified_name = f"[{schema_name}].[{table_name}]"
            df = pd.read_sql(f"SELECT * FROM {qualified_name}", engine)
        else:
            raise ValueError("Either table_name or query must be provided")

        return df

    elif source == "gdm":
        # Load from GDM job artifacts
        from app.services.gdm_service import gdm_service

        job_id = source_config.get("job_id")
        table_name = source_config.get("table_name")

        job = gdm_service.get_status(job_id)
        if not job:
            raise ValueError(f"GDM job '{job_id}' not found")

        if job.status != "completed":
            raise ValueError(f"GDM job '{job_id}' is not completed")

        # Get engine from GDM job
        if job.engine:
            engine = job.engine
        elif job.database_id in active_connections:
            engine = active_connections[job.database_id]["engine"]
        else:
            raise ValueError("No database connection available for GDM job")

        # Find table info from GDM metadata
        schema_name = "dbo"
        if table_name and "." in table_name:
            schema_name, table_name = table_name.split(".", 1)

        qualified_name = f"[{schema_name}].[{table_name}]"
        df = pd.read_sql(f"SELECT * FROM {qualified_name}", engine)
        return df

    elif source == "file":
        file_path = source_config.get("file_path")
        if not file_path:
            raise ValueError("file_path is required for file source")

        if file_path.endswith('.csv'):
            return pd.read_csv(file_path)
        elif file_path.endswith('.parquet'):
            return pd.read_parquet(file_path)
        elif file_path.endswith(('.xlsx', '.xls')):
            return pd.read_excel(file_path)
        else:
            # Try CSV as default
            return pd.read_csv(file_path)

    else:
        raise ValueError(f"Unsupported data source: {source}")


# Endpoints

@router.get("/status")
async def get_service_status():
    """Check if AutoGluon service is available."""
    return {
        "available": autogluon_service.is_available(),
        "message": "AutoGluon is ready" if autogluon_service.is_available()
                   else "AutoGluon is not installed. Install with: pip install autogluon.tabular",
    }


@router.get("/presets")
async def get_presets():
    """Get available training presets."""
    presets = []
    for preset in Preset:
        config = PRESET_CONFIG[preset]
        presets.append(PresetInfo(
            name=preset.value,
            time_limit=config["time_limit"],
            description=config["description"],
        ))
    return {"presets": presets}


@router.get("/metrics")
async def get_metrics():
    """Get available evaluation metrics."""
    classification_metrics = [
        MetricInfo(name="AUC_weighted", display_name="AUC (Weighted)", task="classification",
                   description="Area Under ROC Curve - good for imbalanced classes"),
        MetricInfo(name="accuracy", display_name="Accuracy", task="classification",
                   description="Percentage of correct predictions"),
        MetricInfo(name="f1", display_name="F1 Score", task="classification",
                   description="Harmonic mean of precision and recall"),
        MetricInfo(name="log_loss", display_name="Log Loss", task="classification",
                   description="Logarithmic loss - penalizes confident wrong predictions"),
    ]

    regression_metrics = [
        MetricInfo(name="r2_score", display_name="R2 Score", task="regression",
                   description="Coefficient of determination - 1.0 is perfect"),
        MetricInfo(name="rmse", display_name="RMSE", task="regression",
                   description="Root Mean Squared Error - same units as target"),
        MetricInfo(name="mae", display_name="MAE", task="regression",
                   description="Mean Absolute Error - average prediction error"),
        MetricInfo(name="mape", display_name="MAPE", task="regression",
                   description="Mean Absolute Percentage Error"),
    ]

    return {
        "classification": classification_metrics,
        "regression": regression_metrics,
    }


@router.post("/start", response_model=AutoMLStartResponse)
async def start_automl_job(request: AutoMLStartRequest):
    """Start a new AutoML training job."""
    if not autogluon_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="AutoGluon is not installed. Install with: pip install autogluon.tabular"
        )

    try:
        # Load data from source
        logger.info(f"Loading data from source: {request.source}")
        df = _load_data_from_source(request.source, request.source_config)
        logger.info(f"Loaded {len(df)} rows, {len(df.columns)} columns")

        # Validate target column exists
        if request.target_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"Target column '{request.target_column}' not found in data. "
                       f"Available columns: {', '.join(df.columns[:20])}"
            )

        # Prepare config
        config = {
            "task": request.task,
            "target_column": request.target_column,
            "training_data": df,
            "preset": request.preset,
            "excluded_columns": request.excluded_columns,
            "eval_metric": request.eval_metric,
            "holdout_frac": request.holdout_frac,
            "time_limit": request.time_limit,
            "job_name": request.job_name,
            "tags": request.tags,
        }

        # Submit job
        result = await autogluon_service.submit_job(config)
        return AutoMLStartResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to start AutoML job: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{job_id}/status", response_model=AutoMLStatusResponse)
async def get_job_status(job_id: str):
    """Get status of an AutoML job."""
    result = await autogluon_service.get_job_status(job_id)

    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return AutoMLStatusResponse(**result)


@router.get("/{job_id}/results")
async def get_job_results(job_id: str, include_insights: bool = True):
    """Get results of a completed AutoML job with optional LLM insights."""
    result = await autogluon_service.get_job_results(job_id)

    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if "error" in result and result.get("status") != "completed":
        raise HTTPException(status_code=400, detail=result["error"])

    # Generate LLM insights if requested and not already present
    if include_insights and "insights" not in result:
        try:
            insights = await automl_insights_service.generate_insights(
                job_id=job_id,
                task=result.get("task", "classification"),
                target_column=result.get("target_column", ""),
                best_model=result.get("best_model", ""),
                best_score=result.get("best_score", 0),
                eval_metric=result.get("eval_metric", ""),
                feature_importance=result.get("feature_importance", {}),
                leaderboard=result.get("leaderboard", []),
                num_rows=result.get("num_rows_train", 0),
                num_features=result.get("num_features", 0),
                training_time=result.get("training_time_seconds", 0),
            )
            result["insights"] = insights.to_dict()
        except Exception as e:
            logger.warning(f"Failed to generate insights for job {job_id}: {e}")
            # Continue without insights rather than failing the request

    # Clean NaN values before returning (NaN is not JSON compliant)
    return clean_nan_values(result)


@router.post("/{job_id}/cancel", response_model=AutoMLCancelResponse)
async def cancel_job(job_id: str):
    """Cancel a running AutoML job."""
    result = await autogluon_service.cancel_job(job_id)
    return AutoMLCancelResponse(**result)


@router.get("/{job_id}/leaderboard")
async def get_leaderboard(job_id: str):
    """Get model leaderboard for a completed job."""
    result = await autogluon_service.get_leaderboard(job_id)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return clean_nan_values(result)


@router.get("/{job_id}/feature-importance")
async def get_feature_importance(job_id: str):
    """Get feature importance for a completed job."""
    result = await autogluon_service.get_feature_importance(job_id)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return clean_nan_values(result)


@router.post("/{job_id}/predict")
async def predict(job_id: str, request: PredictRequest):
    """Make predictions using a trained model."""
    result = await autogluon_service.predict(job_id, request.data)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return clean_nan_values(result)


@router.get("/jobs")
async def list_jobs():
    """List all AutoML jobs."""
    jobs = autogluon_service.list_jobs()
    return {"jobs": jobs}


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its model files."""
    success = autogluon_service.cleanup_job(job_id)
    return {"success": success, "job_id": job_id}


@router.post("/upload")
async def upload_training_data(file: UploadFile = File(...)):
    """Upload a CSV file for training."""
    import tempfile
    import os

    if not file.filename.endswith(('.csv', '.xlsx', '.xls', '.parquet')):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Use CSV, Excel, or Parquet."
        )

    try:
        # Save to temp file
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Read and validate
        if suffix == '.csv':
            df = pd.read_csv(tmp_path)
        elif suffix in ['.xlsx', '.xls']:
            df = pd.read_excel(tmp_path)
        elif suffix == '.parquet':
            df = pd.read_parquet(tmp_path)
        else:
            df = pd.read_csv(tmp_path)

        return {
            "file_path": tmp_path,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")
