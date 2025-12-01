"""
Forecast API Routes

Endpoints for GPT-5 powered forecasting and business intelligence.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.forecast_service import forecast_service, ForecastType
from app.services.autogluon_service import autogluon_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/forecasts", tags=["forecasts"])


# Request/Response Models

class ForecastRequest(BaseModel):
    """Request to generate forecasts and insights."""
    automl_job_id: str = Field(..., description="ID of the completed AutoML job")
    forecast_type: str = Field(
        default="both",
        description="Type of forecast: 'timeseries', 'insights', or 'both'"
    )
    forecast_horizon: Optional[int] = Field(
        default=30,
        description="Number of periods to forecast (for timeseries)"
    )
    time_column: Optional[str] = Field(
        default=None,
        description="Name of time/date column (required for timeseries)"
    )
    context: Optional[str] = Field(
        default=None,
        description="Additional business context to inform insights"
    )


class ForecastStatusResponse(BaseModel):
    """Status of a forecast generation job."""
    job_id: str
    status: str
    progress_pct: int
    message: str
    error: Optional[str] = None


class RegenerateRequest(BaseModel):
    """Request to regenerate insights with additional context."""
    additional_context: str = Field(..., description="Additional business context")


# Endpoints

@router.post("/generate")
async def generate_forecast(request: ForecastRequest):
    """
    Generate forecasts and business insights from AutoML results.

    Requires a completed AutoML job. Uses GPT-5 to generate:
    - Executive summary
    - Key business drivers
    - What-if scenarios
    - Strategic recommendations
    - Risk analysis

    Optionally generates time-series forecasts if a time column is specified.
    """
    # Get AutoML job results
    job = autogluon_service.get_job(request.automl_job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"AutoML job {request.automl_job_id} not found"
        )

    if job.status.value != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"AutoML job must be completed. Current status: {job.status.value}"
        )

    if not job.result:
        raise HTTPException(
            status_code=400,
            detail="AutoML job has no results"
        )

    # Convert job result to dict
    automl_results = {
        "job_id": job.result.job_id,
        "task": job.result.task,
        "target_column": job.result.target_column,
        "best_model": job.result.best_model,
        "best_score": job.result.best_score,
        "eval_metric": job.result.eval_metric,
        "feature_importance": job.result.feature_importance,
        "training_time_seconds": job.result.training_time_seconds,
        "num_rows_train": job.result.num_rows_train,
        "num_features": job.result.num_features,
        "leaderboard": job.result.leaderboard,
        "predictions_sample": job.result.predictions_sample,
        "confusion_matrix": job.result.confusion_matrix,
        "class_labels": job.result.class_labels,
    }

    try:
        result = await forecast_service.generate_forecast(
            automl_job_id=request.automl_job_id,
            automl_results=automl_results,
            forecast_type=request.forecast_type,
            forecast_horizon=request.forecast_horizon,
            time_column=request.time_column,
            business_context=request.context,
        )

        return forecast_service.to_dict(result)

    except Exception as e:
        logger.error(f"Error generating forecast: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate forecast: {str(e)}"
        )


@router.get("/{job_id}/status")
async def get_forecast_status(job_id: str):
    """Get the status of a forecast generation job."""
    job = forecast_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Forecast job {job_id} not found"
        )

    return ForecastStatusResponse(
        job_id=job.job_id,
        status=job.status.value,
        progress_pct=job.progress_pct,
        message=job.message,
        error=job.error,
    )


@router.get("/{job_id}")
async def get_forecast_result(job_id: str):
    """Get the result of a completed forecast job."""
    job = forecast_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Forecast job {job_id} not found"
        )

    if job.status.value != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Forecast not ready. Status: {job.status.value}"
        )

    if not job.result:
        raise HTTPException(
            status_code=500,
            detail="Forecast job completed but has no result"
        )

    return forecast_service.to_dict(job.result)


@router.get("/automl/{automl_job_id}")
async def list_forecasts_for_automl(automl_job_id: str):
    """List all forecasts generated for an AutoML job."""
    jobs = forecast_service.get_jobs_for_automl(automl_job_id)

    return {
        "automl_job_id": automl_job_id,
        "forecasts": [
            {
                "job_id": job.job_id,
                "status": job.status.value,
                "forecast_type": job.forecast_type,
                "created_at": job.created_at,
                "result": forecast_service.to_dict(job.result) if job.result else None,
            }
            for job in jobs
        ]
    }


@router.post("/{job_id}/regenerate")
async def regenerate_with_context(job_id: str, request: RegenerateRequest):
    """
    Regenerate insights with additional business context.

    Useful when the user wants to refine the analysis with more specific
    business requirements or questions.
    """
    job = forecast_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Forecast job {job_id} not found"
        )

    # Get original AutoML results
    original_automl_job = autogluon_service.get_job(job.automl_job_id)
    if not original_automl_job or not original_automl_job.result:
        raise HTTPException(
            status_code=400,
            detail="Original AutoML job not found"
        )

    automl_results = {
        "job_id": original_automl_job.result.job_id,
        "task": original_automl_job.result.task,
        "target_column": original_automl_job.result.target_column,
        "best_model": original_automl_job.result.best_model,
        "best_score": original_automl_job.result.best_score,
        "eval_metric": original_automl_job.result.eval_metric,
        "feature_importance": original_automl_job.result.feature_importance,
        "training_time_seconds": original_automl_job.result.training_time_seconds,
        "num_rows_train": original_automl_job.result.num_rows_train,
        "num_features": original_automl_job.result.num_features,
        "leaderboard": original_automl_job.result.leaderboard,
        "predictions_sample": original_automl_job.result.predictions_sample,
    }

    try:
        result = await forecast_service.generate_forecast(
            automl_job_id=job.automl_job_id,
            automl_results=automl_results,
            forecast_type=job.forecast_type,
            business_context=request.additional_context,
        )

        return forecast_service.to_dict(result)

    except Exception as e:
        logger.error(f"Error regenerating forecast: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to regenerate forecast: {str(e)}"
        )


@router.get("/{job_id}/export/csv")
async def export_forecast_csv(job_id: str):
    """Export forecast predictions as CSV."""
    job = forecast_service.get_job(job_id)
    if not job or not job.result:
        raise HTTPException(
            status_code=404,
            detail=f"Forecast job {job_id} not found or not completed"
        )

    if not job.result.timeseries_forecast:
        raise HTTPException(
            status_code=400,
            detail="No time series forecast available to export"
        )

    # Convert predictions to CSV
    import io
    import csv
    from fastapi.responses import StreamingResponse

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["date", "value", "lower_bound", "upper_bound"]
    )
    writer.writeheader()
    for pred in job.result.timeseries_forecast.predictions:
        writer.writerow(pred)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=forecast_{job_id}.csv"
        }
    )


@router.get("/time-columns")
async def get_time_columns(
    connection_id: str = Query(..., description="Database connection ID"),
    table_name: str = Query(..., description="Table name"),
):
    """
    Get list of columns that appear to be time/date columns.

    Useful for selecting the time column for time series forecasting.
    """
    # This would integrate with the database service to inspect column types
    # For now, return a placeholder response

    return {
        "columns": [],
        "message": "Time column detection not yet implemented"
    }
