import copy
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid

import yaml
import pandas as pd

from app.services.autogluon_service import autogluon_service
from app.api.routes.database import active_connections
from app.services.gdm_service import gdm_service
from app.services.playbook_validator import playbook_validator
from app.models.playbook_models import (
    PlaybookConfig,
    PlaybookValidationResult,
    DataSourceConfig,
    ProblemType,
    SplitStrategy,
    ColumnRole,
)

logger = logging.getLogger(__name__)


class PlaybookService:
    """Loads playbook definitions and orchestrates execution steps using AutoGluon."""

    def __init__(self, playbook_dir: Optional[Path] = None) -> None:
        base_dir = Path(__file__).resolve().parents[2]
        self.playbook_dir = playbook_dir or base_dir / "reports" / "playbooks"
        # Use AutoGluon service for local AutoML execution
        self.automl_service = autogluon_service
        self._playbooks_cache: Dict[str, Dict[str, Any]] = {}
        self._load_playbooks()

    def _load_playbooks(self) -> None:
        self._playbooks_cache = {}
        if not self.playbook_dir.exists():
            logger.warning("Playbook directory not found: %s", self.playbook_dir)
            return
        for path in self.playbook_dir.glob("*.yaml"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if data and "id" in data:
                        self._playbooks_cache[data["id"]] = data
            except Exception as exc:
                logger.error("Failed to load playbook %s: %s", path, exc)

    def list_playbooks(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": pb.get("id"),
                "name": pb.get("name"),
                "description": pb.get("description"),
                "domain": pb.get("domain"),
                "required_inputs": pb.get("required_inputs", []),
                "steps": [s.get("type") for s in pb.get("steps", [])],
                "defaults": self._extract_defaults(pb),
            }
            for pb in self._playbooks_cache.values()
        ]

    def get_playbook(self, playbook_id: str) -> Optional[Dict[str, Any]]:
        return self._playbooks_cache.get(playbook_id)

    def save_playbook(self, playbook: Dict[str, Any]) -> Dict[str, Any]:
        """Persist a playbook to disk and refresh the registry."""
        playbook_id = playbook.get("id")
        if not playbook_id:
            raise ValueError("Playbook is missing an 'id' field")

        self.playbook_dir.mkdir(parents=True, exist_ok=True)
        path = self.playbook_dir / f"{playbook_id}.yaml"
        try:
            with open(path, "w", encoding="utf-8") as f:
                yaml.safe_dump(playbook, f, sort_keys=False, allow_unicode=False)
        except Exception as exc:
            logger.error("Failed to write playbook %s: %s", playbook_id, exc)
            raise

        self._playbooks_cache[playbook_id] = playbook
        return playbook

    def _load_data_from_source(self, source: str, source_config: Dict[str, Any]) -> pd.DataFrame:
        """Load training data for AutoML from the requested source."""
        if source == "database":
            connection_id = source_config.get("connection_id")
            if not connection_id or connection_id not in active_connections:
                raise ValueError(f"Database connection '{connection_id}' not found")

            engine = active_connections[connection_id]["engine"]
            table_name = source_config.get("table_name")
            schema_name = source_config.get("schema_name", "dbo")
            query = source_config.get("query")

            if query:
                return pd.read_sql(query, engine)
            if table_name:
                if "." in str(table_name):
                    schema_name, table_name = str(table_name).split(".", 1)
                qualified_name = f"[{schema_name}].[{table_name}]"
                return pd.read_sql(f"SELECT * FROM {qualified_name}", engine)
            raise ValueError("Either table_name or query must be provided for database source")

        if source == "gdm":
            job_id = source_config.get("job_id")
            table_name = source_config.get("table_name")
            if not job_id or not table_name:
                raise ValueError("job_id and table_name are required for GDM source")

            job = gdm_service.get_status(job_id)
            if not job:
                raise ValueError(f"GDM job '{job_id}' not found")
            if job.status != "completed":
                raise ValueError(f"GDM job '{job_id}' is not completed")

            # Try to get engine from GDM job or active connections
            engine = None
            if job.engine:
                engine = job.engine
            elif job.database_id in active_connections:
                engine = active_connections[job.database_id]["engine"]
            elif job.connection_payload:
                # Recreate connection from stored payload
                from sqlalchemy import create_engine as sa_create_engine
                from app.config import settings

                conn_payload = job.connection_payload
                driver = settings.get_odbc_driver()
                connection_string = (
                    f"mssql+pyodbc://{conn_payload['username']}:{conn_payload['password']}@"
                    f"{conn_payload['server']}:{conn_payload.get('port', 1433)}/"
                    f"{conn_payload['database']}?driver={driver}&"
                    f"Encrypt={'yes' if conn_payload.get('encrypt', True) else 'no'}&"
                    f"TrustServerCertificate={'yes' if conn_payload.get('trust_server_certificate', True) else 'no'}"
                )
                engine = sa_create_engine(connection_string, pool_pre_ping=True)
                logger.info(f"Recreated database connection for GDM job {job_id}")
            else:
                raise ValueError(
                    f"No database connection available for GDM job '{job_id}'. "
                    "The original connection may have expired. Please reconnect to the database."
                )

            schema_name = "dbo"
            if "." in str(table_name):
                schema_name, table_name = str(table_name).split(".", 1)

            qualified_name = f"[{schema_name}].[{table_name}]"
            return pd.read_sql(f"SELECT * FROM {qualified_name}", engine)

        if source == "file":
            file_path = source_config.get("file_path")
            if not file_path:
                raise ValueError("file_path is required for file source")
            if file_path.endswith(".csv"):
                return pd.read_csv(file_path)
            if file_path.endswith(".parquet"):
                return pd.read_parquet(file_path)
            if file_path.endswith((".xlsx", ".xls")):
                return pd.read_excel(file_path)
            return pd.read_csv(file_path)

        raise ValueError(f"Unsupported data source: {source}")

    def _merge_playbook_params(self, playbook: Dict[str, Any], params: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Merge override params into the first AutoML step of a playbook."""
        merged = copy.deepcopy(playbook)
        automl_step_idx = next(
            (i for i, step in enumerate(merged.get("steps", [])) if step.get("type") == "automl"),
            None
        )
        if automl_step_idx is None:
            raise ValueError("No AutoML step found in playbook")

        current_params = merged["steps"][automl_step_idx].get("params", {}) or {}
        merged_params = {**current_params, **(params or {})}
        merged["steps"][automl_step_idx]["params"] = merged_params
        return merged, merged_params

    def _prepare_training_frames(
        self,
        playbook_config: PlaybookConfig,
        df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, Optional[pd.DataFrame], Optional[pd.DataFrame], List[str]]:
        """
        Apply playbook constraints and split data into train/val/test.

        Returns train_df, val_df, test_df, and the feature list.
        """
        if playbook_config.target_column not in df.columns:
            raise ValueError(f"Target column '{playbook_config.target_column}' not found in data")

        working_df = df.copy()
        working_df = working_df.dropna(subset=[playbook_config.target_column])

        # Apply column role exclusions
        forbidden = set(playbook_config.forbidden_columns or [])
        forbidden |= {
            col for col, role in playbook_config.column_roles.items()
            if role in {ColumnRole.POST_EVENT, ColumnRole.SENSITIVE, ColumnRole.TECHNICAL_ONLY}
        }

        allowed_features = playbook_config.allowed_features
        target = playbook_config.target_column
        time_col = playbook_config.event_time_column or playbook_config.time_split_column

        candidate_features = allowed_features or [
            c for c in working_df.columns if c not in forbidden and c != target
        ]
        feature_cols = [c for c in candidate_features if c in working_df.columns and c != target]
        if not feature_cols:
            raise ValueError("No usable features remain after applying playbook constraints")

        columns_to_keep = list(dict.fromkeys(feature_cols + [target]))
        if time_col and time_col in working_df.columns and time_col not in columns_to_keep:
            columns_to_keep.append(time_col)

        working_df = working_df[columns_to_keep]

        # Forecasting keeps the full series but we reserve the last horizon for evaluation
        if playbook_config.problem_type == ProblemType.FORECASTING:
            if not time_col or time_col not in working_df.columns:
                raise ValueError("Forecasting requires an event_time_column or time_split_column")

            working_df[time_col] = pd.to_datetime(working_df[time_col])
            working_df = working_df.sort_values(time_col)
            horizon = playbook_config.prediction_horizon or 1
            test_df = working_df.tail(horizon).copy()
            train_df = working_df.iloc[:-horizon] if len(working_df) > horizon else working_df.copy()
            return train_df, None, test_df, feature_cols

        # Time-based split if requested and a time column is available
        if playbook_config.split_strategy == SplitStrategy.TIME_BASED and time_col and time_col in working_df.columns:
            working_df[time_col] = pd.to_datetime(working_df[time_col])
            working_df = working_df.sort_values(time_col)
        else:
            working_df = working_df.sample(frac=1, random_state=42)

        total = len(working_df)
        train_end = max(1, int(total * playbook_config.train_ratio))
        val_end = min(total, train_end + int(total * playbook_config.val_ratio))

        train_df = working_df.iloc[:train_end].copy()
        val_df = working_df.iloc[train_end:val_end].copy() if val_end > train_end else None
        test_df = working_df.iloc[val_end:].copy() if total > val_end else None

        # Remove time column from feature sets for non-forecasting tasks
        if time_col and time_col in train_df.columns:
            train_df = train_df.drop(columns=[time_col])
        if val_df is not None and time_col and time_col in val_df.columns:
            val_df = val_df.drop(columns=[time_col])
        if test_df is not None and time_col and time_col in test_df.columns:
            test_df = test_df.drop(columns=[time_col])

        return train_df, val_df, test_df, feature_cols

    async def run_playbook(
        self,
        playbook_id: str,
        params: Dict[str, Any],
        validation: Optional[PlaybookValidationResult] = None
    ) -> Dict[str, Any]:
        """
        Execute a playbook using AutoGluon for AutoML steps.

        This method orchestrates the execution of playbook steps, currently supporting
        AutoML training via AutoGluon. It loads data from the specified source (GDM, database, or file),
        configures the AutoML job, and submits it for training.
        """
        playbook = self.get_playbook(playbook_id)
        if not playbook:
            logger.error(f"Playbook not found: {playbook_id}")
            return {"status": "failed", "error": "playbook_not_found"}

        try:
            playbook_with_params, merged_params = self._merge_playbook_params(playbook, params or {})
            playbook_config = self.dict_to_playbook_config(playbook_with_params)
            playbook_hash = playbook_config.compute_hash()
        except Exception as exc:
            logger.exception(f"Failed to merge playbook params: {exc}")
            return {"status": "failed", "error": str(exc)}

        # Validate required fields
        if not playbook_config.target_column:
            return {"status": "failed", "error": "missing_fields: target_column"}

        # Determine data source
        source = merged_params.get("source") or playbook_config.source.type or "gdm"
        source_config = merged_params.get("source_config") or {}

        # Backfill GDM source config when target_table is provided
        if source == "gdm":
            if source_config.get("job_id") is None:
                source_config["job_id"] = merged_params.get("gdm_job_id") or playbook_config.gdm_job_id
            if source_config.get("table_name") is None:
                source_config["table_name"] = merged_params.get("target_table") or playbook_config.source.table_name
            if not source_config.get("job_id") and merged_params.get("training_data") is None:
                return {"status": "failed", "error": "Global Data Model is required before running AutoML"}

        # Load training data
        try:
            logger.info(f"Loading training data from source: {source}")
            if merged_params.get("training_data") is not None:
                training_data = merged_params.get("training_data")
            else:
                training_data = self._load_data_from_source(source, source_config)
            logger.info(f"Loaded {len(training_data)} rows for training")
        except Exception as exc:
            logger.exception(f"Failed to load training data: {exc}")
            return {"status": "failed", "error": f"Data loading failed: {str(exc)}"}

        # Prepare splits and enforce playbook constraints
        try:
            train_df, val_df, test_df, features = self._prepare_training_frames(playbook_config, training_data)
        except Exception as exc:
            logger.exception(f"Failed to prepare training data for playbook {playbook_id}: {exc}")
            return {"status": "failed", "error": str(exc)}

        # Convert time limit from minutes to seconds
        time_limit_seconds = None
        if playbook_config.time_limit_minutes:
            time_limit_seconds = int(playbook_config.time_limit_minutes) * 60

        holdout_frac = None if val_df is not None else float(playbook_config.val_ratio)

        # Prepare AutoGluon configuration
        config = {
            "task": playbook_config.problem_type.value,
            "target_column": playbook_config.target_column,
            "training_data": train_df,
            "tuning_data": val_df,
            "test_data": test_df,
            "allowed_features": features,
            "excluded_columns": list(set(playbook_config.forbidden_columns)),
            "holdout_frac": holdout_frac,
            "time_limit": time_limit_seconds,
            "preset": playbook_config.preset,
            "eval_metric": playbook_config.primary_metric,
            "prediction_horizon": playbook_config.prediction_horizon or 1,
            "time_column": playbook_config.event_time_column or playbook_config.time_split_column,
            "job_name": merged_params.get("job_name") or f"{playbook_id}-{uuid.uuid4().hex[:6]}",
            "tags": {
                "playbook": playbook_id,
                "playbook_name": playbook.get("name", ""),
                "domain": playbook.get("domain", "general"),
                "playbook_hash": playbook_hash,
                "gdm_job_id": playbook_config.gdm_job_id or source_config.get("job_id", ""),
                **(merged_params.get("tags") or {}),
            },
            "playbook_id": playbook_id,
            "playbook_hash": playbook_hash,
            "playbook_version": playbook_config.version,
            "business_cost_weights": (
                playbook_config.business_cost_weights.model_dump()
                if playbook_config.business_cost_weights else None
            ),
            "validation_summary": validation.model_dump() if validation else None,
        }

        # Submit job to AutoGluon service
        logger.info(f"Submitting AutoML job for playbook: {playbook_id}")
        try:
            submission = await self.automl_service.submit_job(config)

            if submission.get("status") == "failed":
                logger.error(f"AutoML job submission failed: {submission.get('error')}")
                return {
                    "status": "failed",
                    "error": submission.get("error", "Job submission failed"),
                }

            logger.info(f"AutoML job submitted successfully: {submission.get('job_id')}")
            return {
                "status": submission.get("status", "submitted"),
                "job_id": submission.get("job_id"),
                "playbook_id": playbook_id,
                "playbook_name": playbook.get("name", ""),
                "playbook_hash": playbook_hash,
                "message": f"AutoML training started for {playbook_config.target_column}",
            }
        except Exception as exc:
            logger.exception(f"Failed to submit AutoML job: {exc}")
            return {"status": "failed", "error": str(exc)}

    def _extract_defaults(self, playbook: Dict[str, Any]) -> Dict[str, Any]:
        automl_steps = [s for s in playbook.get("steps", []) if s.get("type") == "automl"]
        if not automl_steps:
            return {}
        params = automl_steps[0].get("params", {}) or {}
        keys = [
            "target_column",
            "target_table",
            "metric",
            "time_limit_minutes",
            "max_trials",
            "task",
        ]
        return {k: v for k, v in params.items() if k in keys and v is not None}

    def dict_to_playbook_config(self, playbook_dict: Dict[str, Any]) -> PlaybookConfig:
        """Convert a playbook dictionary to PlaybookConfig model."""
        # Extract automl step params
        automl_steps = [s for s in playbook_dict.get("steps", []) if s.get("type") == "automl"]
        params = automl_steps[0].get("params", {}) if automl_steps else {}

        # Determine problem type
        task = params.get("task", "classification").lower()
        problem_type_map = {
            "classification": ProblemType.CLASSIFICATION,
            "regression": ProblemType.REGRESSION,
            "forecasting": ProblemType.FORECASTING,
            "clustering": ProblemType.CLUSTERING,
            "anomaly": ProblemType.ANOMALY,
        }
        problem_type = problem_type_map.get(task, ProblemType.CLASSIFICATION)

        # Build source config
        source_type = params.get("source", "gdm")
        source_config = DataSourceConfig(
            type=source_type,
            gdm_job_id=params.get("gdm_job_id") or params.get("source_config", {}).get("job_id"),
            table_name=params.get("target_table") or params.get("source_config", {}).get("table_name"),
            connection_id=params.get("source_config", {}).get("connection_id"),
            query=params.get("source_config", {}).get("query"),
            schema_name=params.get("source_config", {}).get("schema_name"),
            file_path=params.get("source_config", {}).get("file_path"),
        )

        forbidden_columns = params.get("forbidden_columns") or params.get("excluded_columns", [])
        allowed_features = params.get("allowed_features") or params.get("feature_columns")
        split_strategy_raw = params.get("split_strategy")
        split_strategy = SplitStrategy(split_strategy_raw) if split_strategy_raw in SplitStrategy._value2member_map_ else SplitStrategy.RANDOM

        return PlaybookConfig(
            id=playbook_dict.get("id", "unknown"),
            name=playbook_dict.get("name", "Unnamed Playbook"),
            description=playbook_dict.get("description"),
            version=playbook_dict.get("version", "1.0.0"),
            problem_type=problem_type,
            target_column=params.get("target_column", ""),
            prediction_horizon=params.get("prediction_horizon"),
            event_time_column=params.get("event_time_column") or params.get("time_column"),
            allowed_features=allowed_features,
            forbidden_columns=forbidden_columns,
            column_roles=params.get("column_roles", {}),
            split_strategy=split_strategy,
            train_ratio=params.get("train_ratio", 0.7),
            val_ratio=params.get("val_ratio", 0.15),
            test_ratio=params.get("test_ratio", 0.15),
            time_split_column=params.get("time_split_column"),
            primary_metric=params.get("metric", "accuracy"),
            secondary_metrics=params.get("secondary_metrics", []),
            business_cost_weights=params.get("business_cost_weights"),
            time_limit_minutes=params.get("time_limit_minutes", 15),
            max_models=params.get("max_trials", 20),
            preset=params.get("preset", "balanced"),
            source=source_config,
            gdm_job_id=params.get("gdm_job_id"),
            tags=params.get("tags", {}),
        )

    async def validate_playbook(
        self,
        playbook_id: str,
        params: Optional[Dict[str, Any]] = None,
        check_leakage: bool = True,
        sample_size: int = 10000
    ) -> Tuple[PlaybookValidationResult, Optional[pd.DataFrame]]:
        """
        Validate a playbook before execution.

        Returns:
            Tuple of (validation_result, loaded_data or None)
        """
        playbook = self.get_playbook(playbook_id)
        if not playbook:
            return PlaybookValidationResult(
                valid=False,
                errors=[f"Playbook '{playbook_id}' not found"]
            ), None

        try:
            playbook_with_params, merged_params = self._merge_playbook_params(playbook, params or {})
        except ValueError as exc:
            return PlaybookValidationResult(valid=False, errors=[str(exc)]), None

        # Check required fields
        if not merged_params.get("target_column"):
            return PlaybookValidationResult(
                valid=False,
                errors=["target_column is required"]
            ), None

        playbook_config = self.dict_to_playbook_config(playbook_with_params)

        # Load data for validation
        source = merged_params.get("source", playbook_config.source.type)
        source_config = merged_params.get("source_config", {}) or {}

        # Backfill GDM source config
        if source == "gdm":
            if not source_config.get("job_id"):
                source_config["job_id"] = merged_params.get("gdm_job_id") or playbook_config.gdm_job_id
            if not source_config.get("table_name"):
                source_config["table_name"] = merged_params.get("target_table") or playbook_config.source.table_name
            if not source_config.get("job_id") and merged_params.get("training_data") is None:
                return PlaybookValidationResult(
                    valid=False,
                    errors=["Global Data Model job_id is required before running AutoML"]
                ), None

        try:
            df = (
                merged_params["training_data"]
                if merged_params.get("training_data") is not None
                else self._load_data_from_source(source, source_config)
            )
        except Exception as e:
            return PlaybookValidationResult(
                valid=False,
                errors=[f"Failed to load data: {str(e)}"]
            ), None

        # Run validation
        validation_result = await playbook_validator.validate(
            playbook_config,
            df,
            check_leakage=check_leakage,
            sample_size=sample_size
        )

        return validation_result, df

    async def run_playbook_with_validation(
        self,
        playbook_id: str,
        params: Dict[str, Any],
        skip_validation: bool = False
    ) -> Dict[str, Any]:
        """
        Execute a playbook with optional validation.

        This method first validates the playbook configuration, then executes it.
        """
        validation_result = None

        if not skip_validation:
            validation_result, _ = await self.validate_playbook(playbook_id, params)
            if not validation_result.valid:
                return {
                    "status": "failed",
                    "error": "Validation failed",
                    "validation_errors": validation_result.errors,
                    "validation_warnings": validation_result.warnings,
                    "leakage_risks": [r.model_dump() for r in validation_result.leakage_risks],
                }

        # Run the playbook
        result = await self.run_playbook(playbook_id, params, validation_result)

        # Add validation info to result
        if validation_result:
            result["validation"] = {
                "valid": validation_result.valid,
                "warnings": validation_result.warnings,
                "leakage_risks": [r.model_dump() for r in validation_result.leakage_risks],
                "data_readiness": validation_result.data_readiness.value,
            }

        return result
