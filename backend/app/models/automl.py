"""
Pydantic models for AutoML API endpoints.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class TaskType(str, Enum):
    """Supported ML task types."""
    CLASSIFICATION = "classification"
    REGRESSION = "regression"


class Preset(str, Enum):
    """Training quality presets."""
    QUICK = "quick"
    BALANCED = "balanced"
    THOROUGH = "thorough"


class DataSource(str, Enum):
    """Data source types."""
    DATABASE = "database"
    GDM = "gdm"
    UPLOAD = "upload"
    FILE = "file"


class DatabaseSourceConfig(BaseModel):
    """Configuration for database data source."""
    connection_id: str
    table_name: str
    schema_name: Optional[str] = None
    query: Optional[str] = None  # Custom SQL query


class GDMSourceConfig(BaseModel):
    """Configuration for GDM data source."""
    job_id: str
    table_name: str


class FileSourceConfig(BaseModel):
    """Configuration for file data source."""
    file_path: str


class AutoMLStartRequest(BaseModel):
    """Request to start an AutoML job."""
    task: TaskType = Field(default=TaskType.CLASSIFICATION, description="ML task type")
    target_column: str = Field(..., description="Column to predict")

    # Data source
    source: DataSource = Field(..., description="Data source type")
    source_config: Dict[str, Any] = Field(..., description="Source-specific configuration")

    # Training configuration
    preset: Preset = Field(default=Preset.BALANCED, description="Training quality preset")
    excluded_columns: List[str] = Field(default_factory=list, description="Columns to exclude from features")
    eval_metric: Optional[str] = Field(default=None, description="Evaluation metric (auto-selected if not specified)")
    holdout_frac: float = Field(default=0.2, ge=0.1, le=0.5, description="Fraction of data to hold out for validation")
    time_limit: Optional[int] = Field(default=None, ge=60, le=7200, description="Override time limit in seconds")

    # Metadata
    job_name: Optional[str] = Field(default=None, description="Custom job name")
    tags: Dict[str, str] = Field(default_factory=dict, description="Job tags/metadata")


class AutoMLStartResponse(BaseModel):
    """Response from starting an AutoML job."""
    job_id: str
    status: str
    error: Optional[str] = None


class AutoMLStatusResponse(BaseModel):
    """Response with job status."""
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


class LeaderboardEntry(BaseModel):
    """A single entry in the model leaderboard."""
    model: str
    score_val: float
    pred_time_val: Optional[float] = None
    fit_time: Optional[float] = None
    pred_time_val_marginal: Optional[float] = None
    fit_time_marginal: Optional[float] = None
    stack_level: Optional[int] = None
    can_infer: Optional[bool] = None
    fit_order: Optional[int] = None


class PredictionSample(BaseModel):
    """Sample prediction result."""
    actual: Union[str, float]
    predicted: Union[str, float]
    probabilities: Optional[Dict[str, float]] = None


class AutoMLResultsResponse(BaseModel):
    """Response with complete job results."""
    job_id: str
    status: str
    task: str
    target_column: str

    # Model performance
    leaderboard: List[Dict[str, Any]]
    best_model: str
    best_score: float
    eval_metric: str

    # Feature analysis
    feature_importance: Dict[str, float]
    features_used: Optional[List[str]] = None

    # Training info
    training_time_seconds: int
    num_rows_train: int
    num_features: int
    model_path: str
    predictions_path: Optional[str] = None

    # Predictions
    predictions_sample: Optional[List[Dict[str, Any]]] = None
    prediction_intervals: Optional[Dict[str, Any]] = None
    confusion_matrix: Optional[List[List[int]]] = None
    class_labels: Optional[List[str]] = None
    threshold_analysis: Optional[Dict[str, Any]] = None
    gains_summary: Optional[Dict[str, Any]] = None

    # Forecasting
    forecast_data: Optional[List[Dict[str, Any]]] = None

    # Clustering
    cluster_labels: Optional[List[int]] = None
    cluster_centers: Optional[List[List[float]]] = None
    cluster_sizes: Optional[Dict[int, int]] = None
    n_clusters: Optional[int] = None

    # Anomaly
    anomaly_scores: Optional[List[float]] = None
    anomaly_threshold: Optional[float] = None
    n_anomalies: Optional[int] = None

    # Playbook context
    playbook_id: Optional[str] = None
    playbook_hash: Optional[str] = None
    playbook_version: Optional[str] = None
    validation_summary: Optional[Dict[str, Any]] = None

    # LLM insights (added by insights service)
    insights: Optional[Dict[str, Any]] = None


class AutoMLCancelResponse(BaseModel):
    """Response from cancelling a job."""
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None


class AutoMLPredictRequest(BaseModel):
    """Request to make predictions."""
    data: List[Dict[str, Any]] = Field(..., description="Data rows to predict")


class AutoMLPredictResponse(BaseModel):
    """Response with predictions."""
    job_id: str
    predictions: List[Union[str, float]]
    probabilities: Optional[List[Dict[str, float]]] = None
    error: Optional[str] = None


class AutoMLJobSummary(BaseModel):
    """Summary of an AutoML job."""
    job_id: str
    status: str
    progress_pct: int
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class AutoMLListResponse(BaseModel):
    """Response listing all jobs."""
    jobs: List[AutoMLJobSummary]


class PresetInfo(BaseModel):
    """Information about a training preset."""
    name: str
    time_limit: int
    description: str


class AutoMLPresetsResponse(BaseModel):
    """Response with available presets."""
    presets: List[PresetInfo]


class MetricInfo(BaseModel):
    """Information about an evaluation metric."""
    name: str
    display_name: str
    task: str
    description: str


class AutoMLMetricsResponse(BaseModel):
    """Response with available metrics."""
    classification: List[MetricInfo]
    regression: List[MetricInfo]
