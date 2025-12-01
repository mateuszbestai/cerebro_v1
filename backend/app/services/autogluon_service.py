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

logger = logging.getLogger(__name__)

# Check if AutoGluon is available
try:
    from autogluon.tabular import TabularPredictor
    AUTOGLUON_AVAILABLE = True
except ImportError:
    AUTOGLUON_AVAILABLE = False
    TabularPredictor = None
    logger.warning("AutoGluon not installed. Install with: pip install autogluon.tabular")


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
    # FORECASTING = "forecasting"  # Requires autogluon.timeseries


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
METRIC_MAPPING = {
    # Classification metrics
    "AUC_weighted": "roc_auc",
    "accuracy": "accuracy",
    "f1": "f1",
    "f1_weighted": "f1_weighted",
    "precision": "precision",
    "recall": "recall",
    "log_loss": "log_loss",
    # Regression metrics
    "r2_score": "r2",
    "rmse": "root_mean_squared_error",
    "mse": "mean_squared_error",
    "mae": "mean_absolute_error",
    "mape": "mean_absolute_percentage_error",
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
    holdout_frac: float = 0.2
    time_limit: Optional[int] = None  # Override preset time limit
    tags: Dict[str, str] = field(default_factory=dict)
    job_name: Optional[str] = None

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
        """Get AutoGluon-compatible eval metric."""
        if not self.eval_metric:
            return None
        return METRIC_MAPPING.get(self.eval_metric, self.eval_metric)

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
            holdout_frac=float(data.get("holdout_frac", 0.2)),
            time_limit=data.get("time_limit"),
            tags=data.get("tags", {}),
            job_name=data.get("job_name"),
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
        """Execute training in background thread."""
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

            # Validate target column
            if config.target_column not in df.columns:
                raise ValueError(f"Target column '{config.target_column}' not found in data")

            # Remove excluded columns
            columns_to_use = [c for c in df.columns if c not in config.excluded_columns]
            df = df[columns_to_use]

            progress.progress_pct = 10
            progress.current_step = "Preprocessing data"
            progress.add_log("Preprocessing data...")

            # Setup model output path
            model_path = self._output_dir / job_id
            if model_path.exists():
                shutil.rmtree(model_path)

            # Determine problem type
            problem_type = config.task.lower()
            if problem_type not in ["classification", "regression"]:
                # Auto-detect based on target
                unique_values = df[config.target_column].nunique()
                if unique_values <= 20:
                    problem_type = "classification"
                else:
                    problem_type = "regression"
                progress.add_log(f"Auto-detected task type: {problem_type}")

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

            # Create predictor with progress callback
            predictor = TabularPredictor(
                label=config.target_column,
                problem_type=problem_type,
                eval_metric=eval_metric,
                path=str(model_path),
            )

            # Train with periodic progress updates
            progress.add_log(f"Using preset: {ag_presets}")

            # Start training
            predictor.fit(
                train_data=df,
                time_limit=time_limit,
                presets=ag_presets,
                holdout_frac=config.holdout_frac,
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

            # Get confusion matrix for classification
            confusion_matrix = None
            class_labels = None
            if problem_type == "classification":
                try:
                    y_true = df[config.target_column]
                    y_pred = predictor.predict(df)
                    from sklearn.metrics import confusion_matrix as cm
                    class_labels = sorted(y_true.unique().tolist())
                    confusion_matrix = cm(y_true, y_pred, labels=class_labels).tolist()
                except Exception as e:
                    logger.warning(f"Could not compute confusion matrix: {e}")

            # Get sample predictions
            try:
                sample_df = df.head(10).copy()
                sample_preds = predictor.predict(sample_df)
                if problem_type == "classification":
                    sample_probs = predictor.predict_proba(sample_df)
                    predictions_sample = []
                    for i, (idx, row) in enumerate(sample_df.iterrows()):
                        pred_dict = {
                            "actual": str(row[config.target_column]),
                            "predicted": str(sample_preds.iloc[i]),
                        }
                        if hasattr(sample_probs, 'iloc'):
                            probs = sample_probs.iloc[i].to_dict()
                            pred_dict["probabilities"] = {str(k): round(float(v), 4) for k, v in probs.items()}
                        predictions_sample.append(pred_dict)
                else:
                    predictions_sample = [
                        {
                            "actual": float(row[config.target_column]),
                            "predicted": float(sample_preds.iloc[i]),
                        }
                        for i, (idx, row) in enumerate(sample_df.iterrows())
                    ]
            except Exception as e:
                logger.warning(f"Could not generate sample predictions: {e}")
                predictions_sample = None

            # Calculate training time
            training_time = int(time.time() - start_time)

            # Store results
            result = JobResult(
                job_id=job_id,
                status="completed",
                task=problem_type,
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
                predictions_sample=predictions_sample,
                confusion_matrix=confusion_matrix,
                class_labels=class_labels,
            )
            self._results[job_id] = result

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
