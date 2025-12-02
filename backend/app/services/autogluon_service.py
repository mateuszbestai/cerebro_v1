"""
AutoGluon AutoML Service

Provides local AutoML capabilities using AutoGluon TabularPredictor.
Designed for business users with simple configuration presets.
"""

import asyncio
import json
import logging
import os
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# Check if AutoGluon is available
try:
    from autogluon.tabular import TabularPredictor
    AUTOGLUON_AVAILABLE = True
except ImportError:
    AUTOGLUON_AVAILABLE = False
    TabularPredictor = None
    logger.warning("AutoGluon not installed. Install with: pip install autogluon.tabular")

# Check if AutoGluon TimeSeries is available
try:
    from autogluon.timeseries import TimeSeriesPredictor, TimeSeriesDataFrame
    AUTOGLUON_TIMESERIES_AVAILABLE = True
except ImportError:
    AUTOGLUON_TIMESERIES_AVAILABLE = False
    TimeSeriesPredictor = None
    TimeSeriesDataFrame = None
    logger.warning("AutoGluon TimeSeries not installed. Install with: pip install autogluon.timeseries")

# Check sklearn for clustering and anomaly detection
try:
    from sklearn.cluster import KMeans, DBSCAN
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not available for clustering/anomaly detection")

# Business metrics (threshold optimization, gains/lift)
from app.services.business_metrics_service import business_metrics_service


class JobStatus(str, Enum):
    """AutoML job status states."""
    PENDING = "pending"
    PREPARING = "preparing"
    TRAINING = "training"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskType(str, Enum):
    """Supported ML task types."""
    CLASSIFICATION = "classification"
    REGRESSION = "regression"
    FORECASTING = "forecasting"
    CLUSTERING = "clustering"
    ANOMALY = "anomaly"


class Preset(str, Enum):
    """Training quality presets - maps to time budgets."""
    QUICK = "quick"           # 5 minutes - fast exploration
    BALANCED = "balanced"     # 15 minutes - recommended default
    THOROUGH = "thorough"     # 60 minutes - best accuracy


# Preset configurations
PRESET_CONFIG = {
    Preset.QUICK: {
        "time_limit": 300,  # 5 minutes
        "presets": "medium_quality",
        "description": "Quick exploration (5 min)",
    },
    Preset.BALANCED: {
        "time_limit": 900,  # 15 minutes
        "presets": "good_quality",
        "description": "Balanced (15 min) - Recommended",
    },
    Preset.THOROUGH: {
        "time_limit": 3600,  # 60 minutes
        "presets": "best_quality",
        "description": "Thorough (60 min) - Best accuracy",
    },
}

# Metric mappings for AutoGluon
# Maps common metric names (including case variations) to AutoGluon's expected format
METRIC_MAPPING = {
    # Classification metrics - case insensitive mapping
    "accuracy": "accuracy",
    "Accuracy": "accuracy",
    "ACCURACY": "accuracy",
    "acc": "accuracy",
    "balanced_accuracy": "balanced_accuracy",
    "AUC_weighted": "roc_auc_ovr_weighted",  # Best default for multiclass
    "auc_weighted": "roc_auc_ovr_weighted",
    "roc_auc": "roc_auc_ovr_weighted",
    "f1": "f1_weighted",  # Default to weighted for multiclass
    "f1_score": "f1_weighted",
    "f1_weighted": "f1_weighted",
    "f1_macro": "f1_macro",
    "f1_micro": "f1_micro",
    "precision": "precision_weighted",
    "precision_weighted": "precision_weighted",
    "precision_macro": "precision_macro",
    "precision_micro": "precision_micro",
    "recall": "recall_weighted",
    "recall_weighted": "recall_weighted",
    "recall_macro": "recall_macro",
    "recall_micro": "recall_micro",
    "log_loss": "log_loss",
    "logloss": "log_loss",
    "mcc": "mcc",
    # Regression metrics
    "r2": "r2",
    "r2_score": "r2",
    "rmse": "root_mean_squared_error",
    "root_mean_squared_error": "root_mean_squared_error",
    "mse": "mean_squared_error",
    "mean_squared_error": "mean_squared_error",
    "mae": "mean_absolute_error",
    "mean_absolute_error": "mean_absolute_error",
    "mape": "mean_absolute_percentage_error",
    "mean_absolute_percentage_error": "mean_absolute_percentage_error",
}


@dataclass
class AutoGluonJobConfig:
    """Configuration for an AutoGluon training job."""
    task: str
    target_column: str
    training_data: Union[str, pd.DataFrame]
    preset: str = "balanced"
    eval_metric: Optional[str] = None
    excluded_columns: List[str] = field(default_factory=list)
    allowed_features: Optional[List[str]] = None
    tuning_data: Optional[pd.DataFrame] = None
    test_data: Optional[pd.DataFrame] = None
    holdout_frac: float = 0.2
    time_limit: Optional[int] = None  # Override preset time limit
    tags: Dict[str, str] = field(default_factory=dict)
    job_name: Optional[str] = None
    # Forecasting specific
    prediction_horizon: int = 1
    time_column: Optional[str] = None
    id_column: Optional[str] = None  # For panel/multi-series forecasting
    # Clustering specific
    n_clusters: int = 5
    clustering_algorithm: str = "kmeans"  # kmeans, dbscan
    # Anomaly specific
    contamination: float = 0.1  # Expected proportion of anomalies
    # Business metrics
    business_cost_weights: Optional[Dict[str, float]] = None
    # Playbook reference
    playbook_id: Optional[str] = None
    playbook_hash: Optional[str] = None
    playbook_version: Optional[str] = None
    validation_summary: Optional[Dict[str, Any]] = None

    def get_time_limit(self) -> int:
        """Get effective time limit from preset or override."""
        if self.time_limit:
            return self.time_limit
        preset_key = Preset(self.preset) if self.preset in [p.value for p in Preset] else Preset.BALANCED
        return PRESET_CONFIG[preset_key]["time_limit"]

    def get_autogluon_presets(self) -> str:
        """Get AutoGluon presets string."""
        preset_key = Preset(self.preset) if self.preset in [p.value for p in Preset] else Preset.BALANCED
        return PRESET_CONFIG[preset_key]["presets"]

    def get_eval_metric(self) -> Optional[str]:
        """
        Get AutoGluon-compatible eval metric with smart fallbacks.

        Handles case-insensitive metric names and provides sensible defaults
        if the metric is not found or not specified.
        """
        if not self.eval_metric:
            return None

        # Try exact match first
        if self.eval_metric in METRIC_MAPPING:
            return METRIC_MAPPING[self.eval_metric]

        # Try case-insensitive match
        metric_lower = self.eval_metric.lower()
        for key, value in METRIC_MAPPING.items():
            if key.lower() == metric_lower:
                return value

        # Return as-is and let AutoGluon validate it
        # (it might be a valid AutoGluon metric we don't have mapped)
        return self.eval_metric

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AutoGluonJobConfig":
        """Create config from dictionary."""
        return cls(
            task=data.get("task", "classification"),
            target_column=data["target_column"],
            training_data=data["training_data"],
            preset=data.get("preset", "balanced"),
            eval_metric=data.get("eval_metric") or data.get("metric"),
            excluded_columns=data.get("excluded_columns", []),
            allowed_features=data.get("allowed_features"),
            tuning_data=data.get("tuning_data"),
            test_data=data.get("test_data"),
            holdout_frac=float(data.get("holdout_frac", 0.2)),
            time_limit=data.get("time_limit"),
            tags=data.get("tags", {}),
            job_name=data.get("job_name"),
            # Forecasting specific
            prediction_horizon=data.get("prediction_horizon", 1),
            time_column=data.get("time_column") or data.get("event_time_column"),
            id_column=data.get("id_column"),
            # Clustering specific
            n_clusters=data.get("n_clusters", 5),
            clustering_algorithm=data.get("clustering_algorithm", "kmeans"),
            # Anomaly specific
            contamination=float(data.get("contamination", 0.1)),
            # Business metrics
            business_cost_weights=data.get("business_cost_weights"),
            # Playbook reference
            playbook_id=data.get("playbook_id"),
            playbook_hash=data.get("playbook_hash"),
            playbook_version=data.get("playbook_version"),
            validation_summary=data.get("validation_summary"),
        )


@dataclass
class JobProgress:
    """Tracks progress of an AutoML job."""
    job_id: str
    status: JobStatus = JobStatus.PENDING
    progress_pct: int = 0
    current_step: str = "Initializing"
    models_trained: int = 0
    best_model: Optional[str] = None
    best_score: Optional[float] = None
    elapsed_seconds: int = 0
    estimated_remaining: Optional[int] = None
    log_messages: List[str] = field(default_factory=list)
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status.value if isinstance(self.status, JobStatus) else self.status,
            "progress_pct": self.progress_pct,
            "current_step": self.current_step,
            "models_trained": self.models_trained,
            "best_model": self.best_model,
            "best_score": self.best_score,
            "elapsed_seconds": self.elapsed_seconds,
            "estimated_remaining": self.estimated_remaining,
            "log_messages": self.log_messages[-50:],  # Last 50 messages
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }

    def add_log(self, message: str):
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        self.log_messages.append(f"[{timestamp}] {message}")


@dataclass
class JobResult:
    """Results from a completed AutoML job."""
    job_id: str
    status: str
    task: str
    target_column: str
    leaderboard: List[Dict[str, Any]]
    best_model: str
    best_score: float
    eval_metric: str
    feature_importance: Dict[str, float]
    training_time_seconds: int
    num_rows_train: int
    num_features: int
    model_path: str
    predictions_sample: Optional[List[Dict[str, Any]]] = None
    confusion_matrix: Optional[List[List[int]]] = None
    class_labels: Optional[List[str]] = None
    # New fields for extended problem types
    playbook_id: Optional[str] = None
    playbook_hash: Optional[str] = None
    # Forecasting specific
    forecast_horizon: Optional[int] = None
    forecast_data: Optional[List[Dict[str, Any]]] = None
    prediction_intervals: Optional[Dict[str, Any]] = None
    # Clustering specific
    cluster_labels: Optional[List[int]] = None
    cluster_centers: Optional[List[List[float]]] = None
    cluster_sizes: Optional[Dict[int, int]] = None
    n_clusters: Optional[int] = None
    # Anomaly specific
    anomaly_scores: Optional[List[float]] = None
    anomaly_threshold: Optional[float] = None
    n_anomalies: Optional[int] = None
    # Business metrics (computed separately)
    threshold_analysis: Optional[Dict[str, Any]] = None
    gains_summary: Optional[Dict[str, Any]] = None
    features_used: Optional[List[str]] = None
    predictions_path: Optional[str] = None
    playbook_version: Optional[str] = None
    validation_summary: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "task": self.task,
            "target_column": self.target_column,
            "leaderboard": self.leaderboard,
            "best_model": self.best_model,
            "best_score": self.best_score,
            "eval_metric": self.eval_metric,
            "feature_importance": self.feature_importance,
            "training_time_seconds": self.training_time_seconds,
            "num_rows_train": self.num_rows_train,
            "num_features": self.num_features,
            "model_path": self.model_path,
            "predictions_sample": self.predictions_sample,
            "confusion_matrix": self.confusion_matrix,
            "class_labels": self.class_labels,
            # Extended fields
            "playbook_id": self.playbook_id,
            "playbook_hash": self.playbook_hash,
            "forecast_horizon": self.forecast_horizon,
            "forecast_data": self.forecast_data,
            "prediction_intervals": self.prediction_intervals,
            "cluster_labels": self.cluster_labels,
            "cluster_centers": self.cluster_centers,
            "cluster_sizes": self.cluster_sizes,
            "n_clusters": self.n_clusters,
            "anomaly_scores": self.anomaly_scores,
            "anomaly_threshold": self.anomaly_threshold,
            "n_anomalies": self.n_anomalies,
            "threshold_analysis": self.threshold_analysis,
            "gains_summary": self.gains_summary,
            "features_used": self.features_used,
            "predictions_path": self.predictions_path,
            "playbook_version": self.playbook_version,
            "validation_summary": self.validation_summary,
        }


class AutoGluonService:
    """
    Service for running AutoGluon AutoML jobs.

    Manages job lifecycle, progress tracking, and result retrieval.
    Jobs run in background threads to avoid blocking the API.
    """

    def __init__(self, output_dir: Optional[str] = None):
        self._jobs: Dict[str, JobProgress] = {}
        self._results: Dict[str, JobResult] = {}
        self._configs: Dict[str, AutoGluonJobConfig] = {}
        self._threads: Dict[str, threading.Thread] = {}
        self._cancel_flags: Dict[str, bool] = {}

        # Output directory for models
        if output_dir:
            self._output_dir = Path(output_dir)
        else:
            project_root = Path(__file__).resolve().parents[3]
            self._output_dir = project_root / "data" / "automl"

        self._output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"AutoGluon service initialized. Output dir: {self._output_dir}")

    def is_available(self) -> bool:
        """Check if AutoGluon is installed and available."""
        return AUTOGLUON_AVAILABLE

    async def submit_job(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit a new AutoML job.

        Args:
            config: Job configuration dictionary

        Returns:
            Dictionary with job_id and initial status
        """
        if not AUTOGLUON_AVAILABLE:
            return {
                "job_id": None,
                "status": "failed",
                "error": "AutoGluon is not installed. Install with: pip install autogluon.tabular",
            }

        job_config = AutoGluonJobConfig.from_dict(config)
        job_id = job_config.job_name or f"automl-{uuid.uuid4().hex[:10]}"

        # Initialize progress tracking
        progress = JobProgress(job_id=job_id)
        progress.started_at = datetime.utcnow().isoformat()
        progress.add_log("Job submitted")

        self._jobs[job_id] = progress
        self._configs[job_id] = job_config
        self._cancel_flags[job_id] = False

        # Start training in background thread
        thread = threading.Thread(
            target=self._run_training,
            args=(job_id,),
            daemon=True,
        )
        self._threads[job_id] = thread
        thread.start()

        logger.info(f"AutoML job {job_id} submitted")

        return {
            "job_id": job_id,
            "status": "pending",
        }

    def _run_training(self, job_id: str):
        """Execute training in background thread - routes to appropriate task handler."""
        progress = self._jobs[job_id]
        config = self._configs[job_id]
        start_time = time.time()

        try:
            # Update status
            progress.status = JobStatus.PREPARING
            progress.current_step = "Loading data"
            progress.progress_pct = 5
            progress.add_log("Loading training data...")

            # Load data
            if isinstance(config.training_data, str):
                if config.training_data.endswith('.csv'):
                    df = pd.read_csv(config.training_data)
                elif config.training_data.endswith('.parquet'):
                    df = pd.read_parquet(config.training_data)
                else:
                    # Try to load as CSV
                    df = pd.read_csv(config.training_data)
            elif isinstance(config.training_data, pd.DataFrame):
                df = config.training_data
            else:
                raise ValueError(f"Unsupported training data type: {type(config.training_data)}")

            progress.add_log(f"Loaded {len(df):,} rows, {len(df.columns)} columns")

            # Check for cancellation
            if self._cancel_flags.get(job_id):
                progress.status = JobStatus.CANCELLED
                progress.add_log("Job cancelled by user")
                return

            # Prepare optional validation/test splits passed from playbook
            val_df = config.tuning_data.copy() if isinstance(config.tuning_data, pd.DataFrame) else None
            test_df = config.test_data.copy() if isinstance(config.test_data, pd.DataFrame) else None

            # Validate target column (except for clustering which may not need one)
            task = config.task.lower()
            if task != "clustering" and config.target_column not in df.columns:
                raise ValueError(f"Target column '{config.target_column}' not found in data")

            required_cols = {config.target_column}
            if config.time_column:
                required_cols.add(config.time_column)
            if config.id_column:
                required_cols.add(config.id_column)

            def _filter_columns(frame: pd.DataFrame) -> pd.DataFrame:
                """Apply allowed/forbidden feature rules while preserving required columns."""
                keep_cols = []
                for col in frame.columns:
                    if col in required_cols:
                        keep_cols.append(col)
                        continue
                    if config.allowed_features and col not in config.allowed_features:
                        continue
                    if col in config.excluded_columns:
                        continue
                    keep_cols.append(col)
                return frame[keep_cols]

            df = _filter_columns(df)
            if val_df is not None:
                val_df = _filter_columns(val_df)
            if test_df is not None:
                test_df = _filter_columns(test_df)

            progress.progress_pct = 10
            progress.current_step = "Preprocessing data"
            progress.add_log("Preprocessing data with playbook constraints...")

            # Route to appropriate training method based on task type
            if task == "forecasting":
                self._run_forecasting_training(job_id, df, config, progress, start_time)
                return
            elif task == "clustering":
                self._run_clustering_training(job_id, df, config, progress, start_time)
                return
            elif task == "anomaly":
                self._run_anomaly_training(job_id, df, config, progress, start_time)
                return

            # Default: classification/regression - continue with existing logic

            # Setup model output path
            model_path = self._output_dir / job_id
            if model_path.exists():
                shutil.rmtree(model_path)

            # Ensure consistent feature set across splits
            feature_cols = [
                c for c in df.columns
                if c != config.target_column
                and c not in {config.time_column, config.id_column}
            ]
            if not feature_cols:
                raise ValueError("No usable features after applying playbook rules")

            keep_cols = feature_cols + [config.target_column]
            df = df[keep_cols]
            if val_df is not None:
                val_df = val_df.reindex(columns=keep_cols)
            if test_df is not None:
                test_df = test_df.reindex(columns=keep_cols)

            progress.add_log(f"Using {len(feature_cols)} features")

            # Determine problem type and map to AutoGluon's expected values
            task = config.task.lower()
            problem_type = None

            if task in ["classification", "binary", "multiclass"]:
                # AutoGluon requires 'binary' or 'multiclass', not 'classification'
                unique_values = df[config.target_column].nunique()
                if unique_values == 2:
                    problem_type = "binary"
                    progress.add_log(f"Detected binary classification ({unique_values} classes)")
                elif unique_values > 2 and unique_values <= 100:
                    problem_type = "multiclass"
                    progress.add_log(f"Detected multiclass classification ({unique_values} classes)")
                else:
                    # Too many classes, might be regression
                    problem_type = "regression"
                    progress.add_log(f"Too many unique values ({unique_values}), treating as regression")
            elif task == "regression":
                problem_type = "regression"
            else:
                # Auto-detect based on target column
                unique_values = df[config.target_column].nunique()
                total_values = len(df[config.target_column].dropna())
                uniqueness_ratio = unique_values / total_values if total_values > 0 else 1

                if unique_values == 2:
                    problem_type = "binary"
                    progress.add_log(f"Auto-detected: binary classification ({unique_values} classes)")
                elif unique_values <= 20 and uniqueness_ratio < 0.05:
                    problem_type = "multiclass"
                    progress.add_log(f"Auto-detected: multiclass classification ({unique_values} classes)")
                else:
                    problem_type = "regression"
                    progress.add_log(f"Auto-detected: regression ({unique_values} unique values)")

            progress.status = JobStatus.TRAINING
            progress.progress_pct = 15
            progress.current_step = "Starting model training"
            progress.add_log(f"Training {problem_type} model for '{config.target_column}'")
            progress.add_log(f"Time budget: {config.get_time_limit()} seconds")

            # Check for cancellation
            if self._cancel_flags.get(job_id):
                progress.status = JobStatus.CANCELLED
                progress.add_log("Job cancelled by user")
                return

            # Configure AutoGluon
            ag_presets = config.get_autogluon_presets()
            time_limit = config.get_time_limit()
            eval_metric = config.get_eval_metric()

            # Log configuration for debugging
            progress.add_log(f"Problem type: {problem_type}")
            if eval_metric:
                progress.add_log(f"Eval metric: {eval_metric}")
            else:
                progress.add_log("Using default eval metric")

            # Create predictor with progress callback
            # Note: eval_metric=None will use AutoGluon's default for the problem type
            predictor = TabularPredictor(
                label=config.target_column,
                problem_type=problem_type,
                eval_metric=eval_metric,  # Can be None for default
                path=str(model_path),
            )

            # Train with periodic progress updates
            progress.add_log(f"Using preset: {ag_presets}")

            # Start training
            holdout_frac = None if val_df is not None else config.holdout_frac
            predictor.fit(
                train_data=df,
                time_limit=time_limit,
                presets=ag_presets,
                holdout_frac=holdout_frac,
                tuning_data=val_df,
                verbosity=1,
            )

            # Check for cancellation
            if self._cancel_flags.get(job_id):
                progress.status = JobStatus.CANCELLED
                progress.add_log("Job cancelled by user")
                return

            progress.status = JobStatus.EVALUATING
            progress.progress_pct = 85
            progress.current_step = "Evaluating models"
            progress.add_log("Evaluating trained models...")

            # Get leaderboard
            leaderboard = predictor.leaderboard(silent=True)
            leaderboard_dict = leaderboard.to_dict('records')

            # Get best model info
            best_model = predictor.model_best
            best_score = float(leaderboard.iloc[0]['score_val']) if len(leaderboard) > 0 else 0.0

            progress.best_model = best_model
            progress.best_score = best_score
            progress.models_trained = len(leaderboard)

            # Get feature importance
            try:
                feature_importance = predictor.feature_importance(df)
                feature_importance_dict = feature_importance['importance'].to_dict()
            except Exception as e:
                logger.warning(f"Could not compute feature importance: {e}")
                feature_importance_dict = {}

            # Evaluation dataset (prefer test split when provided)
            evaluation_df = test_df if test_df is not None and len(test_df) > 0 else df

            # Prepare outputs
            confusion_matrix = None
            class_labels = None
            predictions_sample: Optional[List[Dict[str, Any]]] = None
            predictions_path: Optional[str] = None
            prediction_intervals: Optional[Dict[str, Any]] = None
            threshold_analysis = None
            gains_summary = None

            if problem_type in ["binary", "multiclass"]:
                try:
                    y_true = evaluation_df[config.target_column]
                    y_pred = predictor.predict(evaluation_df)
                    from sklearn.metrics import confusion_matrix as cm
                    class_labels = sorted(y_true.dropna().unique().tolist())
                    confusion_matrix = cm(y_true, y_pred, labels=class_labels).tolist()
                except Exception as e:
                    logger.warning(f"Could not compute confusion matrix: {e}")

            # Sample predictions with probabilities/intervals
            try:
                sample_df = evaluation_df.head(25).copy()
                sample_preds = predictor.predict(sample_df)
                predictions_sample = []
                if problem_type in ["binary", "multiclass"]:
                    sample_probs = predictor.predict_proba(sample_df)
                    for i, (idx, row) in enumerate(sample_df.iterrows()):
                        probs = sample_probs.iloc[i].to_dict() if hasattr(sample_probs, 'iloc') else {}
                        ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
                        predictions_sample.append({
                            "record_id": int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
                            "actual": str(row[config.target_column]),
                            "predicted": str(sample_preds.iloc[i]),
                            "probabilities": {str(k): round(float(v), 4) for k, v in probs.items()},
                            "top_rank": [
                                {"class": str(cls), "score": round(float(score), 4), "rank": rank + 1}
                                for rank, (cls, score) in enumerate(ranked[:3])
                            ]
                        })
                else:
                    eval_predictions = predictor.predict(evaluation_df)
                    residual_std = float(np.std(evaluation_df[config.target_column] - eval_predictions))
                    for i, (idx, row) in enumerate(sample_df.iterrows()):
                        pred_val = float(sample_preds.iloc[i])
                        predictions_sample.append({
                            "actual": float(row[config.target_column]),
                            "predicted": pred_val,
                            "prediction_lower": float(pred_val - 1.96 * residual_std),
                            "prediction_upper": float(pred_val + 1.96 * residual_std),
                        })
                    prediction_intervals = {
                        "method": "gaussian_residual",
                        "residual_std": residual_std,
                    }
            except Exception as e:
                logger.warning(f"Could not generate sample predictions: {e}")
                predictions_sample = None

            # Persist full predictions and business metrics
            try:
                eval_predictions = predictor.predict(evaluation_df)
                proba_df = None
                if problem_type in ["binary", "multiclass"]:
                    proba_df = predictor.predict_proba(evaluation_df)

                preds_df = evaluation_df.copy()
                preds_df["prediction"] = eval_predictions

                residual_std = None
                if proba_df is not None and hasattr(proba_df, "columns"):
                    for col in proba_df.columns:
                        preds_df[f"proba_{col}"] = proba_df[col]
                else:
                    residual_std = float(np.std(evaluation_df[config.target_column] - eval_predictions))
                    preds_df["prediction_lower"] = preds_df["prediction"] - 1.96 * residual_std
                    preds_df["prediction_upper"] = preds_df["prediction"] + 1.96 * residual_std
                    if not prediction_intervals:
                        prediction_intervals = {
                            "method": "gaussian_residual",
                            "residual_std": residual_std,
                        }

                predictions_file = model_path / "predictions.csv"
                preds_df.to_csv(predictions_file, index=False)
                predictions_path = str(predictions_file)

                # Business metrics for binary classification
                if proba_df is not None and len(class_labels or []) == 2:
                    positive_label = class_labels[-1] if class_labels else proba_df.columns[-1]
                    try:
                        y_proba = proba_df[str(positive_label)].values
                    except Exception:
                        y_proba = proba_df.iloc[:, -1].values

                    from app.models.playbook_models import BusinessCostWeights

                    cost_weights = None
                    if config.business_cost_weights:
                        cost_weights = (
                            config.business_cost_weights
                            if isinstance(config.business_cost_weights, BusinessCostWeights)
                            else BusinessCostWeights(**config.business_cost_weights)
                        )

                    threshold_obj = business_metrics_service.compute_threshold_analysis(
                        y_true=evaluation_df[config.target_column].values,
                        y_proba=y_proba,
                        positive_label=positive_label,
                        cost_weights=cost_weights,
                    )
                    threshold_analysis = threshold_obj.model_dump()

                    gains_obj = business_metrics_service.compute_gains_summary(
                        y_true=evaluation_df[config.target_column].values,
                        y_proba=y_proba,
                        positive_label=positive_label,
                    )
                    gains_summary = gains_obj.model_dump()
            except Exception as e:
                logger.warning(f"Could not persist predictions or business metrics: {e}")

            # Calculate training time
            training_time = int(time.time() - start_time)

            # Store results (normalize task name for frontend display)
            display_task = "classification" if problem_type in ["binary", "multiclass"] else problem_type
            result = JobResult(
                job_id=job_id,
                status="completed",
                task=display_task,
                target_column=config.target_column,
                leaderboard=leaderboard_dict,
                best_model=best_model,
                best_score=best_score,
                eval_metric=str(eval_metric or predictor.eval_metric),
                feature_importance=feature_importance_dict,
                training_time_seconds=training_time,
                num_rows_train=len(df),
                num_features=len(df.columns) - 1,  # Exclude target
                model_path=str(model_path),
                features_used=feature_cols,
                predictions_sample=predictions_sample,
                predictions_path=predictions_path,
                confusion_matrix=confusion_matrix,
                class_labels=class_labels,
                prediction_intervals=prediction_intervals,
                threshold_analysis=threshold_analysis,
                gains_summary=gains_summary,
                playbook_id=config.playbook_id,
                playbook_hash=config.playbook_hash,
                playbook_version=config.playbook_version,
                validation_summary=config.validation_summary,
            )
            self._results[job_id] = result

            # Persist lightweight metadata for reproducibility
            try:
                metadata = {
                    "job_id": job_id,
                    "task": display_task,
                    "problem_type": problem_type,
                    "target_column": config.target_column,
                    "features_used": feature_cols,
                    "playbook_id": config.playbook_id,
                    "playbook_hash": config.playbook_hash,
                    "playbook_version": config.playbook_version,
                    "validation": config.validation_summary,
                    "eval_metric": str(eval_metric or predictor.eval_metric),
                    "best_model": best_model,
                    "best_score": best_score,
                    "training_time_seconds": training_time,
                    "created_at": datetime.utcnow().isoformat(),
                }
                with open(model_path / "metadata.json", "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2)
            except Exception as meta_exc:
                logger.warning(f"Could not persist AutoML metadata: {meta_exc}")

            # Update progress
            progress.status = JobStatus.COMPLETED
            progress.progress_pct = 100
            progress.current_step = "Training complete"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = training_time
            progress.add_log(f"Training completed in {training_time} seconds")
            progress.add_log(f"Best model: {best_model} (score: {best_score:.4f})")

            logger.info(f"AutoML job {job_id} completed. Best model: {best_model}")

        except Exception as e:
            logger.exception(f"AutoML job {job_id} failed: {e}")
            progress.status = JobStatus.FAILED
            progress.error = str(e)
            progress.current_step = "Failed"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = int(time.time() - start_time)
            progress.add_log(f"Error: {str(e)}")

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get current status of a job."""
        if job_id not in self._jobs:
            return {"error": f"Job {job_id} not found", "status": "not_found"}

        progress = self._jobs[job_id]

        # Update elapsed time if still running
        if progress.status in [JobStatus.PREPARING, JobStatus.TRAINING, JobStatus.EVALUATING]:
            if progress.started_at:
                started = datetime.fromisoformat(progress.started_at)
                progress.elapsed_seconds = int((datetime.utcnow() - started).total_seconds())

                # Estimate remaining time based on progress
                if progress.progress_pct > 0:
                    total_estimated = progress.elapsed_seconds * 100 / progress.progress_pct
                    progress.estimated_remaining = max(0, int(total_estimated - progress.elapsed_seconds))

        return progress.to_dict()

    async def get_job_results(self, job_id: str) -> Dict[str, Any]:
        """Get results for a completed job."""
        if job_id not in self._results:
            # Check if job exists but isn't complete
            if job_id in self._jobs:
                status = self._jobs[job_id].status
                return {
                    "error": f"Job {job_id} is not complete (status: {status.value})",
                    "status": status.value,
                }
            return {"error": f"Job {job_id} not found", "status": "not_found"}

        return self._results[job_id].to_dict()

    async def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """Cancel a running job."""
        if job_id not in self._jobs:
            return {"success": False, "error": f"Job {job_id} not found"}

        progress = self._jobs[job_id]

        if progress.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
            return {"success": False, "error": f"Job {job_id} is already {progress.status.value}"}

        # Set cancel flag
        self._cancel_flags[job_id] = True
        progress.add_log("Cancellation requested")

        return {"success": True, "message": f"Cancellation requested for job {job_id}"}

    async def get_leaderboard(self, job_id: str) -> Dict[str, Any]:
        """Get model leaderboard for a completed job."""
        if job_id not in self._results:
            return {"error": f"Results for job {job_id} not found"}

        result = self._results[job_id]
        return {
            "job_id": job_id,
            "leaderboard": result.leaderboard,
            "best_model": result.best_model,
            "best_score": result.best_score,
        }

    async def get_feature_importance(self, job_id: str) -> Dict[str, Any]:
        """Get feature importance for a completed job."""
        if job_id not in self._results:
            return {"error": f"Results for job {job_id} not found"}

        result = self._results[job_id]
        return {
            "job_id": job_id,
            "feature_importance": result.feature_importance,
        }

    async def predict(
        self,
        job_id: str,
        data: Union[pd.DataFrame, List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """Make predictions using a trained model."""
        if job_id not in self._results:
            return {"error": f"Results for job {job_id} not found"}

        result = self._results[job_id]

        try:
            # Load predictor
            predictor = TabularPredictor.load(result.model_path)

            # Convert data if needed
            if isinstance(data, list):
                df = pd.DataFrame(data)
            else:
                df = data

            # Make predictions
            predictions = predictor.predict(df).tolist()

            # Get probabilities for classification
            probabilities = None
            if result.task == "classification":
                try:
                    probs = predictor.predict_proba(df)
                    probabilities = probs.to_dict('records')
                except Exception:
                    pass

            return {
                "job_id": job_id,
                "predictions": predictions,
                "probabilities": probabilities,
            }

        except Exception as e:
            logger.exception(f"Prediction failed for job {job_id}: {e}")
            return {"error": str(e)}

    def list_jobs(self) -> List[Dict[str, Any]]:
        """List all jobs with basic info."""
        jobs = []
        for job_id, progress in self._jobs.items():
            jobs.append({
                "job_id": job_id,
                "status": progress.status.value if isinstance(progress.status, JobStatus) else progress.status,
                "progress_pct": progress.progress_pct,
                "started_at": progress.started_at,
                "completed_at": progress.completed_at,
            })
        return jobs

    def _run_forecasting_training(
        self,
        job_id: str,
        df: pd.DataFrame,
        config: AutoGluonJobConfig,
        progress: JobProgress,
        start_time: float
    ):
        """Execute forecasting training using AutoGluon TimeSeries."""
        if not AUTOGLUON_TIMESERIES_AVAILABLE:
            raise ValueError(
                "AutoGluon TimeSeries not available. "
                "Install with: pip install autogluon.timeseries"
            )

        try:
            model_path = self._output_dir / job_id
            if model_path.exists():
                shutil.rmtree(model_path)

            progress.status = JobStatus.TRAINING
            progress.progress_pct = 15
            progress.current_step = "Preparing time series data"
            progress.add_log(f"Forecasting target: {config.target_column}")
            progress.add_log(f"Prediction horizon: {config.prediction_horizon}")

            # Prepare time series data
            time_col = config.time_column
            if not time_col:
                # Try to find a time column
                for col in df.columns:
                    if pd.api.types.is_datetime64_any_dtype(df[col]):
                        time_col = col
                        break
                if not time_col:
                    raise ValueError("No time column specified or found for forecasting")

            # Convert to datetime if needed
            df[time_col] = pd.to_datetime(df[time_col])
            df = df.sort_values(time_col)

            # Create TimeSeriesDataFrame
            id_col = config.id_column or "item_id"
            if id_col not in df.columns:
                df[id_col] = "series_1"  # Single series

            ts_df = TimeSeriesDataFrame.from_data_frame(
                df,
                id_column=id_col,
                timestamp_column=time_col
            )

            progress.progress_pct = 25
            progress.current_step = "Training forecasting model"
            progress.add_log("Starting TimeSeriesPredictor training...")

            # Create and train predictor
            predictor = TimeSeriesPredictor(
                target=config.target_column,
                prediction_length=config.prediction_horizon,
                path=str(model_path),
                eval_metric=config.eval_metric or "MASE",
            )

            time_limit = config.get_time_limit()
            predictor.fit(
                train_data=ts_df,
                time_limit=time_limit,
                presets=config.get_autogluon_presets(),
            )

            # Check for cancellation
            if self._cancel_flags.get(job_id):
                progress.status = JobStatus.CANCELLED
                progress.add_log("Job cancelled by user")
                return

            progress.status = JobStatus.EVALUATING
            progress.progress_pct = 85
            progress.current_step = "Evaluating forecast"
            progress.add_log("Generating forecasts...")

            # Get leaderboard
            leaderboard = predictor.leaderboard()
            leaderboard_dict = leaderboard.to_dict('records') if hasattr(leaderboard, 'to_dict') else []

            best_model = predictor.model_best if hasattr(predictor, 'model_best') else "TimeSeriesPredictor"
            best_score = float(leaderboard.iloc[0]['score_val']) if len(leaderboard) > 0 else 0.0

            # Generate forecasts
            predictions = predictor.predict(ts_df)
            forecast_data = []

            if hasattr(predictions, 'reset_index'):
                pred_df = predictions.reset_index()
                for _, row in pred_df.head(100).iterrows():
                    forecast_data.append({
                        "timestamp": str(row.get(time_col, row.name)),
                        "prediction": float(row.get('mean', row.get(config.target_column, 0))),
                        "lower": float(row.get('0.1', row.get('mean', 0) * 0.9)),
                        "upper": float(row.get('0.9', row.get('mean', 0) * 1.1)),
                    })

            # Feature importance (may not be available for all models)
            feature_importance_dict = {}
            try:
                fi = predictor.feature_importance()
                if hasattr(fi, 'to_dict'):
                    feature_importance_dict = fi.to_dict()
            except Exception:
                pass

            training_time = int(time.time() - start_time)
            feature_cols = [
                c for c in df.columns
                if c not in {config.target_column, time_col, id_col}
            ]

            result = JobResult(
                job_id=job_id,
                status="completed",
                task="forecasting",
                target_column=config.target_column,
                leaderboard=leaderboard_dict,
                best_model=best_model,
                best_score=best_score,
                eval_metric=config.eval_metric or "MASE",
                feature_importance=feature_importance_dict,
                training_time_seconds=training_time,
                num_rows_train=len(df),
                num_features=len(df.columns) - 1,
                model_path=str(model_path),
                forecast_horizon=config.prediction_horizon,
                forecast_data=forecast_data,
                features_used=feature_cols,
                playbook_id=config.playbook_id,
                playbook_hash=config.playbook_hash,
            )
            self._results[job_id] = result

            progress.status = JobStatus.COMPLETED
            progress.progress_pct = 100
            progress.current_step = "Forecasting complete"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = training_time
            progress.best_model = best_model
            progress.best_score = best_score
            progress.add_log(f"Forecasting completed in {training_time} seconds")

            logger.info(f"Forecasting job {job_id} completed")

        except Exception as e:
            logger.exception(f"Forecasting job {job_id} failed: {e}")
            progress.status = JobStatus.FAILED
            progress.error = str(e)
            progress.current_step = "Failed"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = int(time.time() - start_time)
            progress.add_log(f"Error: {str(e)}")

    def _run_clustering_training(
        self,
        job_id: str,
        df: pd.DataFrame,
        config: AutoGluonJobConfig,
        progress: JobProgress,
        start_time: float
    ):
        """Execute clustering using sklearn (KMeans or DBSCAN)."""
        if not SKLEARN_AVAILABLE:
            raise ValueError("scikit-learn not available for clustering")

        try:
            model_path = self._output_dir / job_id
            model_path.mkdir(parents=True, exist_ok=True)

            progress.status = JobStatus.TRAINING
            progress.progress_pct = 15
            progress.current_step = "Preparing clustering data"

            # Select numeric columns only
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if config.target_column in numeric_cols:
                numeric_cols.remove(config.target_column)

            if len(numeric_cols) == 0:
                raise ValueError("No numeric features available for clustering")

            X = df[numeric_cols].copy()

            # Handle missing values
            X = X.fillna(X.mean())

            progress.progress_pct = 25
            progress.current_step = "Scaling features"
            progress.add_log(f"Using {len(numeric_cols)} numeric features")

            # Scale features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            progress.progress_pct = 40
            progress.current_step = "Running clustering algorithm"

            # Choose algorithm
            algorithm = config.clustering_algorithm.lower()
            n_clusters = config.n_clusters

            if algorithm == "dbscan":
                progress.add_log("Using DBSCAN clustering")
                clusterer = DBSCAN(eps=0.5, min_samples=5)
                cluster_labels = clusterer.fit_predict(X_scaled)
                n_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
                cluster_centers = None
            else:  # Default: KMeans
                progress.add_log(f"Using KMeans with {n_clusters} clusters")
                clusterer = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                cluster_labels = clusterer.fit_predict(X_scaled)
                cluster_centers = clusterer.cluster_centers_.tolist()

            # Check for cancellation
            if self._cancel_flags.get(job_id):
                progress.status = JobStatus.CANCELLED
                progress.add_log("Job cancelled by user")
                return

            progress.status = JobStatus.EVALUATING
            progress.progress_pct = 75
            progress.current_step = "Computing cluster statistics"

            # Compute cluster sizes
            unique, counts = np.unique(cluster_labels, return_counts=True)
            cluster_sizes = {int(k): int(v) for k, v in zip(unique, counts)}

            # Compute silhouette score if we have valid clusters
            silhouette = 0.0
            if n_clusters > 1 and len(set(cluster_labels)) > 1:
                try:
                    from sklearn.metrics import silhouette_score
                    silhouette = float(silhouette_score(X_scaled, cluster_labels))
                except Exception:
                    pass

            progress.add_log(f"Found {n_clusters} clusters")
            progress.add_log(f"Silhouette score: {silhouette:.4f}")

            # Feature importance based on cluster separation
            feature_importance_dict = {}
            for i, col in enumerate(numeric_cols):
                # Compute variance ratio for each feature
                between_var = np.var([X_scaled[cluster_labels == c, i].mean()
                                      for c in unique if c != -1])
                total_var = np.var(X_scaled[:, i])
                importance = between_var / total_var if total_var > 0 else 0
                feature_importance_dict[col] = float(importance)

            # Normalize importance
            total_imp = sum(feature_importance_dict.values())
            if total_imp > 0:
                feature_importance_dict = {k: v / total_imp
                                          for k, v in feature_importance_dict.items()}

            # Save model artifacts
            import joblib
            joblib.dump(clusterer, model_path / "clusterer.joblib")
            joblib.dump(scaler, model_path / "scaler.joblib")

            training_time = int(time.time() - start_time)

            result = JobResult(
                job_id=job_id,
                status="completed",
                task="clustering",
                target_column=config.target_column or "cluster",
                leaderboard=[{"model": algorithm, "score_val": silhouette}],
                best_model=algorithm,
                best_score=silhouette,
                eval_metric="silhouette_score",
                feature_importance=feature_importance_dict,
                training_time_seconds=training_time,
                num_rows_train=len(df),
                num_features=len(numeric_cols),
                model_path=str(model_path),
                features_used=numeric_cols,
                cluster_labels=cluster_labels.tolist(),
                cluster_centers=cluster_centers,
                cluster_sizes=cluster_sizes,
                n_clusters=n_clusters,
                playbook_id=config.playbook_id,
                playbook_hash=config.playbook_hash,
            )
            self._results[job_id] = result

            progress.status = JobStatus.COMPLETED
            progress.progress_pct = 100
            progress.current_step = "Clustering complete"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = training_time
            progress.best_model = algorithm
            progress.best_score = silhouette
            progress.add_log(f"Clustering completed in {training_time} seconds")

            logger.info(f"Clustering job {job_id} completed with {n_clusters} clusters")

        except Exception as e:
            logger.exception(f"Clustering job {job_id} failed: {e}")
            progress.status = JobStatus.FAILED
            progress.error = str(e)
            progress.current_step = "Failed"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = int(time.time() - start_time)
            progress.add_log(f"Error: {str(e)}")

    def _run_anomaly_training(
        self,
        job_id: str,
        df: pd.DataFrame,
        config: AutoGluonJobConfig,
        progress: JobProgress,
        start_time: float
    ):
        """Execute anomaly detection using IsolationForest."""
        if not SKLEARN_AVAILABLE:
            raise ValueError("scikit-learn not available for anomaly detection")

        try:
            model_path = self._output_dir / job_id
            model_path.mkdir(parents=True, exist_ok=True)

            progress.status = JobStatus.TRAINING
            progress.progress_pct = 15
            progress.current_step = "Preparing anomaly detection data"

            # Select numeric columns only
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            target_col = config.target_column
            if target_col in numeric_cols:
                numeric_cols.remove(target_col)

            if len(numeric_cols) == 0:
                raise ValueError("No numeric features available for anomaly detection")

            X = df[numeric_cols].copy()

            # Handle missing values
            X = X.fillna(X.mean())

            progress.progress_pct = 25
            progress.current_step = "Scaling features"
            progress.add_log(f"Using {len(numeric_cols)} numeric features")

            # Scale features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            progress.progress_pct = 40
            progress.current_step = "Training Isolation Forest"
            progress.add_log(f"Contamination: {config.contamination}")

            # Train Isolation Forest
            detector = IsolationForest(
                contamination=config.contamination,
                random_state=42,
                n_estimators=100,
                n_jobs=-1
            )
            detector.fit(X_scaled)

            # Check for cancellation
            if self._cancel_flags.get(job_id):
                progress.status = JobStatus.CANCELLED
                progress.add_log("Job cancelled by user")
                return

            progress.status = JobStatus.EVALUATING
            progress.progress_pct = 75
            progress.current_step = "Computing anomaly scores"

            # Get anomaly scores (negative = more anomalous in sklearn)
            raw_scores = detector.decision_function(X_scaled)
            # Convert to positive scores where higher = more anomalous
            anomaly_scores = -raw_scores
            # Normalize to 0-1 range
            min_score, max_score = anomaly_scores.min(), anomaly_scores.max()
            if max_score > min_score:
                anomaly_scores = (anomaly_scores - min_score) / (max_score - min_score)
            else:
                anomaly_scores = np.zeros_like(anomaly_scores)

            # Predictions: -1 = anomaly, 1 = normal in sklearn
            predictions = detector.predict(X_scaled)
            is_anomaly = predictions == -1

            # Compute threshold
            threshold = np.percentile(anomaly_scores, (1 - config.contamination) * 100)
            n_anomalies = int(is_anomaly.sum())

            progress.add_log(f"Detected {n_anomalies} anomalies ({n_anomalies/len(df)*100:.1f}%)")

            # Feature importance based on isolation depth
            feature_importance_dict = {}
            for i, col in enumerate(numeric_cols):
                # Estimate importance by feature variance contribution
                importance = np.std(X_scaled[:, i])
                feature_importance_dict[col] = float(importance)

            # Normalize importance
            total_imp = sum(feature_importance_dict.values())
            if total_imp > 0:
                feature_importance_dict = {k: v / total_imp
                                          for k, v in feature_importance_dict.items()}

            # Compute evaluation score (if we have labels)
            eval_score = 0.0
            if target_col and target_col in df.columns:
                try:
                    y_true = df[target_col].values
                    from sklearn.metrics import roc_auc_score
                    eval_score = float(roc_auc_score(y_true, anomaly_scores))
                    progress.add_log(f"ROC-AUC: {eval_score:.4f}")
                except Exception:
                    pass

            # Sample predictions
            predictions_sample = []
            sample_indices = df.head(20).index
            for i, idx in enumerate(sample_indices):
                predictions_sample.append({
                    "index": int(idx),
                    "anomaly_score": float(anomaly_scores[i]),
                    "is_anomaly": bool(is_anomaly[i]),
                    "actual": str(df.loc[idx, target_col]) if target_col in df.columns else None
                })

            # Save model artifacts
            import joblib
            joblib.dump(detector, model_path / "detector.joblib")
            joblib.dump(scaler, model_path / "scaler.joblib")

            training_time = int(time.time() - start_time)

            result = JobResult(
                job_id=job_id,
                status="completed",
                task="anomaly",
                target_column=config.target_column or "anomaly_score",
                leaderboard=[{"model": "IsolationForest", "score_val": eval_score}],
                best_model="IsolationForest",
                best_score=eval_score,
                eval_metric="roc_auc" if eval_score > 0 else "contamination",
                feature_importance=feature_importance_dict,
                training_time_seconds=training_time,
                num_rows_train=len(df),
                num_features=len(numeric_cols),
                model_path=str(model_path),
                features_used=numeric_cols,
                anomaly_scores=anomaly_scores.tolist(),
                anomaly_threshold=float(threshold),
                n_anomalies=n_anomalies,
                predictions_sample=predictions_sample,
                playbook_id=config.playbook_id,
                playbook_hash=config.playbook_hash,
            )
            self._results[job_id] = result

            progress.status = JobStatus.COMPLETED
            progress.progress_pct = 100
            progress.current_step = "Anomaly detection complete"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = training_time
            progress.best_model = "IsolationForest"
            progress.best_score = eval_score
            progress.models_trained = 1
            progress.add_log(f"Anomaly detection completed in {training_time} seconds")

            logger.info(f"Anomaly job {job_id} completed: {n_anomalies} anomalies detected")

        except Exception as e:
            logger.exception(f"Anomaly detection job {job_id} failed: {e}")
            progress.status = JobStatus.FAILED
            progress.error = str(e)
            progress.current_step = "Failed"
            progress.completed_at = datetime.utcnow().isoformat()
            progress.elapsed_seconds = int(time.time() - start_time)
            progress.add_log(f"Error: {str(e)}")

    def cleanup_job(self, job_id: str) -> bool:
        """Remove job data and model files."""
        if job_id in self._jobs:
            del self._jobs[job_id]
        if job_id in self._results:
            result = self._results[job_id]
            model_path = Path(result.model_path)
            if model_path.exists():
                shutil.rmtree(model_path)
            del self._results[job_id]
        if job_id in self._configs:
            del self._configs[job_id]
        if job_id in self._cancel_flags:
            del self._cancel_flags[job_id]
        return True


# Global service instance
autogluon_service = AutoGluonService()
