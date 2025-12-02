"""
Pydantic models for the Playbook-driven AutoML system.

This module defines the complete data contracts for:
- Playbook configuration (single source of truth for ML jobs)
- Validation results (schema and leakage checks)
- AutoML results (predictions, explanations, business metrics)
"""

import hashlib
import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


# =============================================================================
# ENUMS
# =============================================================================

class ProblemType(str, Enum):
    """Supported ML problem types."""
    CLASSIFICATION = "classification"
    REGRESSION = "regression"
    FORECASTING = "forecasting"
    CLUSTERING = "clustering"
    ANOMALY = "anomaly"


class ColumnRole(str, Enum):
    """Semantic roles for columns in the dataset."""
    TARGET = "target"
    FEATURE = "feature"
    EVENT_TIME = "event_time"           # Timestamp for time-based splits
    POST_EVENT = "post_event"           # Leakage risk - occurs after target
    SENSITIVE = "sensitive"             # PII/sensitive data - exclude
    TECHNICAL_ONLY = "technical_only"   # IDs, hashes, etc. - not predictive
    IDENTIFIER = "identifier"           # Row identifiers


class SplitStrategy(str, Enum):
    """Data split strategies."""
    RANDOM = "random"
    TIME_BASED = "time_based"
    STRATIFIED = "stratified"


class LeakageRiskLevel(str, Enum):
    """Severity of leakage risk."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DataReadinessStatus(str, Enum):
    """Overall data readiness for AutoML."""
    READY = "ready"
    REVIEW_NEEDED = "review_needed"
    INSUFFICIENT_DATA = "insufficient_data"


# =============================================================================
# PLAYBOOK CONFIGURATION
# =============================================================================

class BusinessCostWeights(BaseModel):
    """Business cost configuration for threshold optimization."""
    false_positive_cost: float = Field(default=1.0, ge=0, description="Cost of false positive")
    false_negative_cost: float = Field(default=1.0, ge=0, description="Cost of false negative")
    true_positive_value: float = Field(default=1.0, ge=0, description="Value of true positive")
    true_negative_value: float = Field(default=0.0, ge=0, description="Value of true negative")


class DataSourceConfig(BaseModel):
    """Configuration for data source."""
    type: str = Field(..., description="Source type: 'gdm', 'database', 'file'")

    # GDM source
    gdm_job_id: Optional[str] = Field(default=None, description="GDM job ID")
    table_name: Optional[str] = Field(default=None, description="Table to use from GDM")

    # Database source
    connection_id: Optional[str] = Field(default=None, description="Database connection ID")
    query: Optional[str] = Field(default=None, description="Custom SQL query")
    schema_name: Optional[str] = Field(default=None, description="Database schema")

    # File source
    file_path: Optional[str] = Field(default=None, description="Path to data file")


class PlaybookConfig(BaseModel):
    """
    Complete playbook specification - single source of truth for AutoML jobs.

    This model defines everything needed to execute an AutoML experiment:
    - Problem definition (type, target, features)
    - Data configuration (source, splits)
    - Training parameters (metric, budget)
    - Business context (cost weights, explanations)
    """

    # Identity
    id: str = Field(..., min_length=1, description="Unique playbook identifier")
    name: str = Field(..., min_length=1, description="Human-readable name")
    description: Optional[str] = Field(default=None, description="Playbook description")
    version: str = Field(default="1.0.0", description="Playbook version")

    # Problem Definition
    problem_type: ProblemType = Field(..., description="ML problem type")
    target_column: str = Field(..., min_length=1, description="Column to predict")
    prediction_horizon: Optional[int] = Field(
        default=None,
        ge=1,
        description="Forecast horizon (for forecasting only)"
    )
    event_time_column: Optional[str] = Field(
        default=None,
        description="Timestamp column for time-based operations"
    )

    # Feature Configuration
    allowed_features: Optional[List[str]] = Field(
        default=None,
        description="Explicit list of features to use (None = all except forbidden)"
    )
    forbidden_columns: List[str] = Field(
        default_factory=list,
        description="Columns to exclude (leakage, sensitive, technical)"
    )
    column_roles: Dict[str, ColumnRole] = Field(
        default_factory=dict,
        description="Semantic role assignments for columns"
    )

    # Split Configuration
    split_strategy: SplitStrategy = Field(
        default=SplitStrategy.RANDOM,
        description="How to split train/val/test"
    )
    train_ratio: float = Field(default=0.7, ge=0.5, le=0.9, description="Training data ratio")
    val_ratio: float = Field(default=0.15, ge=0.05, le=0.3, description="Validation data ratio")
    test_ratio: float = Field(default=0.15, ge=0.05, le=0.3, description="Test data ratio")
    time_split_column: Optional[str] = Field(
        default=None,
        description="Column for time-based splitting"
    )

    # Metrics & Business Context
    primary_metric: str = Field(..., description="Primary evaluation metric")
    secondary_metrics: List[str] = Field(
        default_factory=list,
        description="Additional metrics to track"
    )
    business_cost_weights: Optional[BusinessCostWeights] = Field(
        default=None,
        description="Business cost weights for threshold optimization"
    )

    # Compute & Budget
    time_limit_minutes: int = Field(
        default=15,
        ge=1,
        le=480,
        description="Training time budget in minutes"
    )
    max_models: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of models to train"
    )
    preset: str = Field(
        default="balanced",
        description="Training preset (quick, balanced, thorough)"
    )

    # Data Source
    source: DataSourceConfig = Field(..., description="Data source configuration")

    # Metadata
    gdm_job_id: Optional[str] = Field(default=None, description="Source GDM job ID")
    created_at: Optional[str] = Field(default=None, description="Creation timestamp")
    created_by: Optional[str] = Field(default=None, description="Creator identifier")
    tags: Dict[str, str] = Field(default_factory=dict, description="Custom tags")

    @field_validator('id')
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Ensure ID is a valid slug."""
        import re
        if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$', v):
            # Auto-convert to valid slug
            slug = re.sub(r'[^a-z0-9]+', '-', v.lower()).strip('-')
            return slug if slug else 'playbook'
        return v

    @model_validator(mode='after')
    def validate_ratios(self) -> 'PlaybookConfig':
        """Ensure split ratios sum to 1.0."""
        total = self.train_ratio + self.val_ratio + self.test_ratio
        if abs(total - 1.0) > 0.01:
            # Normalize ratios
            self.train_ratio = self.train_ratio / total
            self.val_ratio = self.val_ratio / total
            self.test_ratio = self.test_ratio / total
        return self

    @model_validator(mode='after')
    def validate_forecasting_config(self) -> 'PlaybookConfig':
        """Ensure forecasting has required fields."""
        if self.problem_type == ProblemType.FORECASTING:
            if not self.prediction_horizon:
                self.prediction_horizon = 1
            if not self.event_time_column and not self.time_split_column:
                raise ValueError("Forecasting requires event_time_column or time_split_column")
        return self

    def compute_hash(self) -> str:
        """Compute a deterministic hash of the playbook configuration."""
        # Create a canonical JSON representation
        config_dict = self.model_dump(exclude={'created_at', 'created_by'})
        config_json = json.dumps(config_dict, sort_keys=True, default=str)
        return hashlib.sha256(config_json.encode()).hexdigest()[:16]


# =============================================================================
# VALIDATION RESULTS
# =============================================================================

class LeakageRisk(BaseModel):
    """Details about a potential data leakage risk."""
    column: str = Field(..., description="Column with leakage risk")
    risk_level: LeakageRiskLevel = Field(..., description="Severity of risk")
    reason: str = Field(..., description="Why this is a leakage risk")
    recommendation: str = Field(..., description="Recommended action")
    correlation_with_target: Optional[float] = Field(
        default=None,
        description="Correlation coefficient with target (if computed)"
    )


class SchemaIssue(BaseModel):
    """Schema validation issue."""
    field: str = Field(..., description="Field with issue")
    issue: str = Field(..., description="Description of the issue")
    severity: str = Field(default="error", description="error, warning, or info")


class PlaybookValidationResult(BaseModel):
    """Results from validating a playbook against data."""
    valid: bool = Field(..., description="Whether playbook is valid for execution")

    # Errors prevent execution
    errors: List[str] = Field(default_factory=list, description="Blocking errors")

    # Warnings should be reviewed but don't block
    warnings: List[str] = Field(default_factory=list, description="Non-blocking warnings")

    # Detailed leakage analysis
    leakage_risks: List[LeakageRisk] = Field(
        default_factory=list,
        description="Potential data leakage risks"
    )

    # Schema issues
    schema_issues: List[SchemaIssue] = Field(
        default_factory=list,
        description="Schema validation issues"
    )

    # Data summary
    row_count: Optional[int] = Field(default=None, description="Total rows in dataset")
    feature_count: Optional[int] = Field(default=None, description="Number of features")
    target_distribution: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Target column distribution summary"
    )

    # Data readiness
    data_readiness: DataReadinessStatus = Field(
        default=DataReadinessStatus.REVIEW_NEEDED,
        description="Overall data readiness status"
    )


# =============================================================================
# AUTOML RESULTS
# =============================================================================

class PredictionResult(BaseModel):
    """Single prediction with explanations."""
    record_id: Optional[Union[str, int]] = Field(default=None, description="Record identifier")
    prediction: Union[str, float, int] = Field(..., description="Predicted value")

    # Classification specific
    confidence: Optional[float] = Field(default=None, ge=0, le=1, description="Prediction confidence")
    probabilities: Optional[Dict[str, float]] = Field(
        default=None,
        description="Class probabilities (classification)"
    )
    predicted_class_rank: Optional[int] = Field(
        default=None,
        description="Rank in top-N predictions"
    )

    # Regression/Forecasting specific
    prediction_lower: Optional[float] = Field(
        default=None,
        description="Lower bound of prediction interval"
    )
    prediction_upper: Optional[float] = Field(
        default=None,
        description="Upper bound of prediction interval"
    )

    # Clustering specific
    cluster_label: Optional[int] = Field(default=None, description="Assigned cluster")
    cluster_distance: Optional[float] = Field(
        default=None,
        description="Distance to cluster centroid"
    )

    # Anomaly specific
    anomaly_score: Optional[float] = Field(
        default=None,
        description="Anomaly score (higher = more anomalous)"
    )
    is_anomaly: Optional[bool] = Field(default=None, description="Anomaly flag")

    # Explanations
    local_explanation: Optional[Dict[str, float]] = Field(
        default=None,
        description="Feature contributions to this prediction"
    )


class ThresholdAnalysis(BaseModel):
    """Analysis of classification thresholds."""
    optimal_threshold: float = Field(..., description="Recommended threshold")
    optimal_metric_value: float = Field(..., description="Metric value at optimal threshold")

    # Metrics at optimal threshold
    precision_at_threshold: float = Field(..., description="Precision at threshold")
    recall_at_threshold: float = Field(..., description="Recall at threshold")
    f1_at_threshold: float = Field(..., description="F1 at threshold")

    # Business impact
    expected_cost_at_threshold: Optional[float] = Field(
        default=None,
        description="Expected cost using business weights"
    )

    # Threshold curve data
    threshold_curve: List[Dict[str, float]] = Field(
        default_factory=list,
        description="Precision/recall at various thresholds"
    )


class CapturePoint(BaseModel):
    """Point on capture/gains curve."""
    percentile: float = Field(..., description="Population percentile (0-100)")
    capture_rate: float = Field(..., description="Percentage of positives captured")
    cumulative_count: int = Field(..., description="Cumulative count at percentile")


class LiftDecile(BaseModel):
    """Lift statistics for a decile."""
    decile: int = Field(..., ge=1, le=10, description="Decile number (1=top)")
    lift: float = Field(..., description="Lift value")
    cumulative_lift: float = Field(..., description="Cumulative lift")
    response_rate: float = Field(..., description="Response rate in decile")
    count: int = Field(..., description="Records in decile")


class GainsSummary(BaseModel):
    """Summary of gains/lift analysis."""
    capture_curve: List[CapturePoint] = Field(
        default_factory=list,
        description="Cumulative capture curve"
    )
    lift_by_decile: List[LiftDecile] = Field(
        default_factory=list,
        description="Lift analysis by decile"
    )
    auc_capture: Optional[float] = Field(
        default=None,
        description="Area under capture curve"
    )
    top_10_capture: Optional[float] = Field(
        default=None,
        description="% of positives in top 10%"
    )
    top_20_capture: Optional[float] = Field(
        default=None,
        description="% of positives in top 20%"
    )


class ClusterSummary(BaseModel):
    """Summary of a cluster."""
    cluster_id: int = Field(..., description="Cluster identifier")
    size: int = Field(..., description="Number of records")
    percentage: float = Field(..., description="Percentage of total")
    centroid: Optional[Dict[str, float]] = Field(
        default=None,
        description="Cluster centroid values"
    )
    top_features: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Most distinctive features"
    )
    label: Optional[str] = Field(default=None, description="Human-readable label")


class AnomalySummary(BaseModel):
    """Summary of anomaly detection results."""
    total_anomalies: int = Field(..., description="Number of anomalies detected")
    anomaly_rate: float = Field(..., description="Percentage of data flagged")
    threshold_used: float = Field(..., description="Score threshold used")
    score_distribution: Dict[str, float] = Field(
        default_factory=dict,
        description="Score distribution statistics"
    )
    top_anomalies: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Most anomalous records"
    )


class GlobalExplanation(BaseModel):
    """Global model explanations."""
    feature_importance: Dict[str, float] = Field(
        default_factory=dict,
        description="Feature importance scores"
    )
    shap_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="SHAP summary statistics"
    )
    top_drivers: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Top prediction drivers with business interpretation"
    )


class GPT5Interpretation(BaseModel):
    """GPT-5 generated interpretation of results."""
    executive_summary: str = Field(..., description="High-level summary")
    key_findings: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Key findings with confidence"
    )
    recommended_actions: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Recommended business actions"
    )
    estimated_impact: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Estimated business impact"
    )
    risks_and_caveats: List[str] = Field(
        default_factory=list,
        description="Important caveats and risks"
    )
    generated_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="Generation timestamp"
    )


class AutoMLResult(BaseModel):
    """
    Complete results from an AutoML job.

    Contains all information needed for the Results Dashboard:
    - Predictions with explanations
    - Model performance metrics
    - Business metrics (threshold, lift, gains)
    - GPT-5 interpretation
    """

    # Identity
    job_id: str = Field(..., description="AutoML job ID")
    playbook_id: str = Field(..., description="Source playbook ID")
    playbook_hash: str = Field(..., description="Playbook config hash for reproducibility")

    # Status
    status: str = Field(..., description="Job status")
    problem_type: ProblemType = Field(..., description="Problem type")

    # Model Info
    best_model: str = Field(..., description="Best model name")
    leaderboard: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Model leaderboard"
    )

    # Metrics
    primary_metric_name: str = Field(..., description="Primary metric name")
    primary_metric_value: float = Field(..., description="Primary metric value")
    secondary_metrics: Dict[str, float] = Field(
        default_factory=dict,
        description="Secondary metric values"
    )

    # Predictions
    predictions: List[PredictionResult] = Field(
        default_factory=list,
        description="Sample predictions with explanations"
    )
    predictions_path: Optional[str] = Field(
        default=None,
        description="Path to full predictions file"
    )

    # Explanations
    global_explanation: Optional[GlobalExplanation] = Field(
        default=None,
        description="Global model explanations"
    )

    # Classification specific
    confusion_matrix: Optional[List[List[int]]] = Field(
        default=None,
        description="Confusion matrix"
    )
    class_labels: Optional[List[str]] = Field(
        default=None,
        description="Class labels"
    )
    threshold_analysis: Optional[ThresholdAnalysis] = Field(
        default=None,
        description="Threshold optimization results"
    )
    gains_summary: Optional[GainsSummary] = Field(
        default=None,
        description="Gains/lift analysis"
    )

    # Clustering specific
    cluster_summary: Optional[List[ClusterSummary]] = Field(
        default=None,
        description="Cluster summaries"
    )

    # Anomaly specific
    anomaly_summary: Optional[AnomalySummary] = Field(
        default=None,
        description="Anomaly detection summary"
    )

    # Training info
    training_time_seconds: int = Field(..., description="Total training time")
    num_rows_train: int = Field(..., description="Training rows")
    num_rows_val: int = Field(default=0, description="Validation rows")
    num_rows_test: int = Field(default=0, description="Test rows")
    num_features: int = Field(..., description="Number of features used")
    features_used: List[str] = Field(
        default_factory=list,
        description="List of features used"
    )

    # Artifacts
    model_path: str = Field(..., description="Path to saved model")
    artifacts_path: Optional[str] = Field(
        default=None,
        description="Path to job artifacts directory"
    )

    # Interpretation
    interpretation: Optional[GPT5Interpretation] = Field(
        default=None,
        description="GPT-5 generated interpretation"
    )

    # Timestamps
    started_at: str = Field(..., description="Job start time")
    completed_at: str = Field(..., description="Job completion time")


# =============================================================================
# API REQUEST/RESPONSE MODELS
# =============================================================================

class PlaybookValidateRequest(BaseModel):
    """Request to validate a playbook."""
    playbook: PlaybookConfig = Field(..., description="Playbook to validate")
    check_leakage: bool = Field(default=True, description="Run leakage detection")
    sample_size: int = Field(
        default=10000,
        ge=100,
        le=100000,
        description="Sample size for validation checks"
    )


class PlaybookExecuteRequest(BaseModel):
    """Request to execute a playbook."""
    playbook_id: str = Field(..., description="Playbook ID to execute")
    override_params: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Parameters to override"
    )
    skip_validation: bool = Field(
        default=False,
        description="Skip validation (use with caution)"
    )


class PlaybookExecuteResponse(BaseModel):
    """Response from executing a playbook."""
    job_id: str = Field(..., description="AutoML job ID")
    playbook_id: str = Field(..., description="Executed playbook ID")
    playbook_hash: str = Field(..., description="Playbook configuration hash")
    status: str = Field(..., description="Initial status")
    validation_result: Optional[PlaybookValidationResult] = Field(
        default=None,
        description="Validation result if validation was run"
    )


class FullResultsRequest(BaseModel):
    """Request for full results with business metrics."""
    include_predictions: bool = Field(
        default=True,
        description="Include sample predictions"
    )
    predictions_limit: int = Field(
        default=100,
        ge=10,
        le=1000,
        description="Max predictions to include"
    )
    compute_shap: bool = Field(
        default=False,
        description="Compute SHAP explanations (slower)"
    )
    generate_interpretation: bool = Field(
        default=True,
        description="Generate GPT-5 interpretation"
    )


class InterpretationRequest(BaseModel):
    """Request to generate GPT-5 interpretation."""
    business_context: Optional[str] = Field(
        default=None,
        description="Additional business context"
    )
    focus_areas: List[str] = Field(
        default_factory=list,
        description="Areas to focus interpretation on"
    )
    regenerate: bool = Field(
        default=False,
        description="Force regeneration even if cached"
    )
