"""
Playbook Validation Service

Validates playbook configurations before execution:
- Schema validation (columns exist, types match)
- Leakage detection (post-event features, high correlations)
- Data quality checks (sufficient rows, class balance)
- Split feasibility (enough data for time-based splits)
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.models.playbook_models import (
    ColumnRole,
    DataReadinessStatus,
    LeakageRisk,
    LeakageRiskLevel,
    PlaybookConfig,
    PlaybookValidationResult,
    ProblemType,
    SchemaIssue,
    SplitStrategy,
)

logger = logging.getLogger(__name__)

# Minimum requirements
MIN_ROWS_FOR_AUTOML = 100
MIN_ROWS_FOR_TIMESERIES = 50
MIN_FEATURES = 1
MAX_CLASSIFICATION_CLASSES = 100
MIN_CLASS_SAMPLES = 10

# Leakage detection tokens
POST_EVENT_TOKENS = [
    'outcome', 'result', 'final', 'end', 'after', 'post', 'response',
    'converted', 'churned', 'cancelled', 'completed', 'closed',
    '_after', '_post', '_result', '_outcome'
]

SENSITIVE_TOKENS = [
    'ssn', 'social_security', 'password', 'secret', 'token', 'key',
    'credit_card', 'card_number', 'cvv', 'pin', 'account_number',
    'bank_account', 'routing_number', 'tax_id', 'ein', 'itin'
]

TECHNICAL_TOKENS = [
    '_id', '_uuid', '_guid', '_hash', '_checksum', '_token',
    'created_at', 'updated_at', 'modified_at', 'deleted_at',
    'row_num', 'row_id', 'index', 'pk', 'fk'
]

# Metric compatibility
CLASSIFICATION_METRICS = [
    'accuracy', 'balanced_accuracy', 'f1', 'f1_weighted', 'f1_macro', 'f1_micro',
    'precision', 'precision_weighted', 'recall', 'recall_weighted',
    'roc_auc', 'auc', 'auc_weighted', 'log_loss', 'mcc'
]

REGRESSION_METRICS = [
    'r2', 'r2_score', 'rmse', 'root_mean_squared_error', 'mse', 'mean_squared_error',
    'mae', 'mean_absolute_error', 'mape', 'mean_absolute_percentage_error'
]

FORECASTING_METRICS = REGRESSION_METRICS + ['mase', 'smape', 'wql']


class PlaybookValidator:
    """Validates playbook configurations before AutoML execution."""

    def __init__(self):
        self._validation_cache: Dict[str, PlaybookValidationResult] = {}

    async def validate(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame,
        check_leakage: bool = True,
        sample_size: int = 10000
    ) -> PlaybookValidationResult:
        """
        Validate a playbook against the provided data.

        Args:
            playbook: Playbook configuration to validate
            data: DataFrame to validate against
            check_leakage: Whether to run leakage detection
            sample_size: Sample size for expensive checks

        Returns:
            PlaybookValidationResult with errors, warnings, and leakage risks
        """
        errors: List[str] = []
        warnings: List[str] = []
        leakage_risks: List[LeakageRisk] = []
        schema_issues: List[SchemaIssue] = []

        # Sample data for expensive operations
        if len(data) > sample_size:
            sample_data = data.sample(n=sample_size, random_state=42)
        else:
            sample_data = data

        # 1. Schema validation
        schema_errors, schema_warns, schema_issues_list = self._validate_schema(
            playbook, data
        )
        errors.extend(schema_errors)
        warnings.extend(schema_warns)
        schema_issues.extend(schema_issues_list)

        # 2. Target validation
        target_errors, target_warns = self._validate_target(playbook, data)
        errors.extend(target_errors)
        warnings.extend(target_warns)

        # 3. Metric compatibility
        metric_errors, metric_warns = self._validate_metrics(playbook)
        errors.extend(metric_errors)
        warnings.extend(metric_warns)

        # 4. Split feasibility
        split_errors, split_warns = self._validate_split(playbook, data)
        errors.extend(split_errors)
        warnings.extend(split_warns)

        # 5. Leakage detection (if enabled)
        if check_leakage and not errors:  # Only check leakage if no blocking errors
            leakage_risks = self._detect_leakage(playbook, sample_data)

            # Convert high-risk leakage to errors
            for risk in leakage_risks:
                if risk.risk_level == LeakageRiskLevel.HIGH:
                    errors.append(
                        f"High leakage risk: column '{risk.column}' - {risk.reason}"
                    )
                elif risk.risk_level == LeakageRiskLevel.MEDIUM:
                    warnings.append(
                        f"Potential leakage: column '{risk.column}' - {risk.reason}"
                    )

        # 6. Data quality checks
        quality_errors, quality_warns = self._check_data_quality(playbook, data)
        errors.extend(quality_errors)
        warnings.extend(quality_warns)

        # Compute target distribution
        target_distribution = self._compute_target_distribution(
            playbook, data
        )

        # Determine data readiness
        data_readiness = self._assess_data_readiness(
            errors, warnings, leakage_risks, len(data), data.shape[1] - 1
        )

        return PlaybookValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            leakage_risks=leakage_risks,
            schema_issues=schema_issues,
            row_count=len(data),
            feature_count=data.shape[1] - 1,  # Exclude target
            target_distribution=target_distribution,
            data_readiness=data_readiness
        )

    def _validate_schema(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame
    ) -> Tuple[List[str], List[str], List[SchemaIssue]]:
        """Validate schema: columns exist and types are compatible."""
        errors = []
        warnings = []
        issues = []

        columns = set(data.columns)

        # Check target column exists
        if playbook.target_column not in columns:
            errors.append(
                f"Target column '{playbook.target_column}' not found in data. "
                f"Available columns: {sorted(columns)[:10]}..."
            )
            issues.append(SchemaIssue(
                field='target_column',
                issue=f"Column '{playbook.target_column}' not found",
                severity='error'
            ))

        # Check event_time_column if specified
        if playbook.event_time_column and playbook.event_time_column not in columns:
            errors.append(
                f"Event time column '{playbook.event_time_column}' not found"
            )
            issues.append(SchemaIssue(
                field='event_time_column',
                issue=f"Column '{playbook.event_time_column}' not found",
                severity='error'
            ))

        # Check time_split_column if specified
        if playbook.time_split_column and playbook.time_split_column not in columns:
            errors.append(
                f"Time split column '{playbook.time_split_column}' not found"
            )
            issues.append(SchemaIssue(
                field='time_split_column',
                issue=f"Column '{playbook.time_split_column}' not found",
                severity='error'
            ))

        # Check allowed_features if specified
        if playbook.allowed_features:
            missing_features = set(playbook.allowed_features) - columns
            if missing_features:
                warnings.append(
                    f"Allowed features not found: {sorted(missing_features)}"
                )
                for feat in missing_features:
                    issues.append(SchemaIssue(
                        field='allowed_features',
                        issue=f"Feature '{feat}' not found",
                        severity='warning'
                    ))

        # Check forbidden_columns exist (warning only)
        if playbook.forbidden_columns:
            missing_forbidden = set(playbook.forbidden_columns) - columns
            if missing_forbidden:
                warnings.append(
                    f"Forbidden columns not found (may be fine): {sorted(missing_forbidden)}"
                )

        # Validate time column is datetime-like
        time_col = playbook.event_time_column or playbook.time_split_column
        if time_col and time_col in columns:
            col_dtype = data[time_col].dtype
            if not (pd.api.types.is_datetime64_any_dtype(col_dtype) or
                    pd.api.types.is_object_dtype(col_dtype)):
                warnings.append(
                    f"Time column '{time_col}' has type {col_dtype}, "
                    "expected datetime. Will attempt conversion."
                )

        return errors, warnings, issues

    def _validate_target(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame
    ) -> Tuple[List[str], List[str]]:
        """Validate target column for the problem type."""
        errors = []
        warnings = []

        if playbook.target_column not in data.columns:
            return errors, warnings  # Already caught in schema validation

        target = data[playbook.target_column]
        unique_count = target.nunique()
        null_pct = target.isnull().mean() * 100

        # Check for nulls in target
        if null_pct > 0:
            if null_pct > 20:
                errors.append(
                    f"Target column has {null_pct:.1f}% null values. "
                    "Consider handling missing targets before AutoML."
                )
            else:
                warnings.append(
                    f"Target column has {null_pct:.1f}% null values. "
                    "Rows with null targets will be excluded."
                )

        # Problem-type specific validation
        if playbook.problem_type == ProblemType.CLASSIFICATION:
            if unique_count > MAX_CLASSIFICATION_CLASSES:
                # Check if this might be better suited for regression
                is_numeric = pd.api.types.is_numeric_dtype(target)
                suggestion = "regression or ordinal encoding" if is_numeric else "grouping rare classes or regression"

                errors.append(
                    f"Classification target has {unique_count} classes. "
                    f"Maximum supported: {MAX_CLASSIFICATION_CLASSES}. "
                    f"Consider {suggestion}."
                )
            elif unique_count > 50:
                warnings.append(
                    f"Classification target has {unique_count} classes. "
                    "This is high-cardinality classification which may require significant training time. "
                    "Consider grouping rare classes or using regression if appropriate."
                )
            elif unique_count > 20:
                warnings.append(
                    f"Classification target has {unique_count} classes. "
                    "This may require more training time."
                )

            # Check class balance
            value_counts = target.value_counts()
            min_class_count = value_counts.min()
            if min_class_count < MIN_CLASS_SAMPLES:
                warnings.append(
                    f"Smallest class has only {min_class_count} samples. "
                    "Consider oversampling or collecting more data."
                )

            # Check for severe imbalance
            majority_pct = value_counts.iloc[0] / len(target) * 100
            if majority_pct > 95:
                warnings.append(
                    f"Severe class imbalance: majority class is {majority_pct:.1f}%. "
                    "Consider using balanced_accuracy or f1 metric."
                )

        elif playbook.problem_type == ProblemType.REGRESSION:
            if unique_count < 10:
                warnings.append(
                    f"Regression target has only {unique_count} unique values. "
                    "Consider classification if these are distinct categories."
                )

            # Check for numeric type
            if not pd.api.types.is_numeric_dtype(target):
                errors.append(
                    "Regression target must be numeric. "
                    f"Current type: {target.dtype}"
                )

        elif playbook.problem_type == ProblemType.FORECASTING:
            if not pd.api.types.is_numeric_dtype(target):
                errors.append(
                    "Forecasting target must be numeric. "
                    f"Current type: {target.dtype}"
                )

            if not playbook.event_time_column and not playbook.time_split_column:
                errors.append(
                    "Forecasting requires a time column. "
                    "Set event_time_column or time_split_column."
                )

        elif playbook.problem_type == ProblemType.CLUSTERING:
            # Clustering doesn't use target in the same way
            warnings.append(
                "Clustering is unsupervised. Target column will be used "
                "for evaluation only, not training."
            )

        elif playbook.problem_type == ProblemType.ANOMALY:
            if unique_count != 2:
                warnings.append(
                    "Anomaly detection works best with binary labels "
                    "(normal/anomaly). Multi-class will be binarized."
                )

        return errors, warnings

    def _validate_metrics(
        self,
        playbook: PlaybookConfig
    ) -> Tuple[List[str], List[str]]:
        """Validate metric compatibility with problem type."""
        errors = []
        warnings = []

        metric = playbook.primary_metric.lower()

        if playbook.problem_type == ProblemType.CLASSIFICATION:
            if metric not in [m.lower() for m in CLASSIFICATION_METRICS]:
                if metric in [m.lower() for m in REGRESSION_METRICS]:
                    errors.append(
                        f"Metric '{playbook.primary_metric}' is for regression, "
                        "not classification. Use accuracy, f1, roc_auc, etc."
                    )
                else:
                    warnings.append(
                        f"Unknown metric '{playbook.primary_metric}'. "
                        "AutoGluon will attempt to use it."
                    )

        elif playbook.problem_type in [ProblemType.REGRESSION, ProblemType.FORECASTING]:
            valid_metrics = (
                FORECASTING_METRICS if playbook.problem_type == ProblemType.FORECASTING
                else REGRESSION_METRICS
            )
            if metric not in [m.lower() for m in valid_metrics]:
                if metric in [m.lower() for m in CLASSIFICATION_METRICS]:
                    errors.append(
                        f"Metric '{playbook.primary_metric}' is for classification, "
                        f"not {playbook.problem_type.value}. Use rmse, mae, r2, etc."
                    )
                else:
                    warnings.append(
                        f"Unknown metric '{playbook.primary_metric}'. "
                        "AutoGluon will attempt to use it."
                    )

        # Validate secondary metrics
        for secondary in playbook.secondary_metrics:
            sec_lower = secondary.lower()
            all_metrics = CLASSIFICATION_METRICS + REGRESSION_METRICS + FORECASTING_METRICS
            if sec_lower not in [m.lower() for m in all_metrics]:
                warnings.append(f"Unknown secondary metric: '{secondary}'")

        return errors, warnings

    def _validate_split(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame
    ) -> Tuple[List[str], List[str]]:
        """Validate split configuration."""
        errors = []
        warnings = []

        n_rows = len(data)

        # Check minimum rows
        min_required = (
            MIN_ROWS_FOR_TIMESERIES
            if playbook.problem_type == ProblemType.FORECASTING
            else MIN_ROWS_FOR_AUTOML
        )

        if n_rows < min_required:
            errors.append(
                f"Dataset has {n_rows} rows. "
                f"Minimum required: {min_required}"
            )

        # Check split produces enough data
        train_rows = int(n_rows * playbook.train_ratio)
        val_rows = int(n_rows * playbook.val_ratio)
        test_rows = int(n_rows * playbook.test_ratio)

        if train_rows < 50:
            errors.append(
                f"Training split would have only {train_rows} rows. "
                "Increase dataset size or adjust split ratios."
            )

        if val_rows < 10:
            warnings.append(
                f"Validation split will have only {val_rows} rows. "
                "Model selection may be unreliable."
            )

        # Time-based split validation
        if playbook.split_strategy == SplitStrategy.TIME_BASED:
            time_col = playbook.time_split_column or playbook.event_time_column
            if not time_col:
                errors.append(
                    "Time-based split requires time_split_column or event_time_column"
                )
            elif time_col in data.columns:
                # Check time column has sufficient variation
                try:
                    time_data = pd.to_datetime(data[time_col])
                    time_range = time_data.max() - time_data.min()
                    if time_range.days < 7:
                        warnings.append(
                            f"Time range is only {time_range.days} days. "
                            "Time-based split may not work well."
                        )
                except Exception:
                    warnings.append(
                        f"Could not parse time column '{time_col}' as datetime"
                    )

        return errors, warnings

    def _detect_leakage(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame
    ) -> List[LeakageRisk]:
        """Detect potential data leakage risks."""
        risks = []

        target = playbook.target_column
        if target not in data.columns:
            return risks

        feature_columns = [
            c for c in data.columns
            if c != target and c not in playbook.forbidden_columns
        ]

        for col in feature_columns:
            col_lower = col.lower()

            # Check for post-event indicators in name
            for token in POST_EVENT_TOKENS:
                if token in col_lower:
                    risks.append(LeakageRisk(
                        column=col,
                        risk_level=LeakageRiskLevel.HIGH,
                        reason=f"Column name contains post-event indicator '{token}'",
                        recommendation=f"Add '{col}' to forbidden_columns or verify it's available at prediction time"
                    ))
                    break

            # Check for sensitive data indicators
            for token in SENSITIVE_TOKENS:
                if token in col_lower:
                    risks.append(LeakageRisk(
                        column=col,
                        risk_level=LeakageRiskLevel.MEDIUM,
                        reason=f"Column may contain sensitive data ('{token}')",
                        recommendation=f"Review '{col}' for PII. Add to forbidden_columns if sensitive."
                    ))
                    break

            # Check for technical/ID columns
            for token in TECHNICAL_TOKENS:
                if col_lower.endswith(token) or token in col_lower:
                    risks.append(LeakageRisk(
                        column=col,
                        risk_level=LeakageRiskLevel.LOW,
                        reason=f"Column appears to be technical/identifier ('{token}')",
                        recommendation=f"Consider excluding '{col}' as it's likely not predictive"
                    ))
                    break

        # Check for high correlation with target (potential leakage)
        try:
            numeric_cols = data[feature_columns].select_dtypes(include=[np.number]).columns
            if len(numeric_cols) > 0 and pd.api.types.is_numeric_dtype(data[target]):
                correlations = data[numeric_cols].corrwith(data[target]).abs()
                high_corr = correlations[correlations > 0.95].index.tolist()

                for col in high_corr:
                    if col not in [r.column for r in risks]:  # Don't duplicate
                        risks.append(LeakageRisk(
                            column=col,
                            risk_level=LeakageRiskLevel.HIGH,
                            reason=f"Extremely high correlation ({correlations[col]:.3f}) with target",
                            recommendation=f"Investigate '{col}'. May be derived from target or post-event.",
                            correlation_with_target=float(correlations[col])
                        ))

                # Medium correlation warning
                med_corr = correlations[
                    (correlations > 0.8) & (correlations <= 0.95)
                ].index.tolist()

                for col in med_corr:
                    if col not in [r.column for r in risks]:
                        risks.append(LeakageRisk(
                            column=col,
                            risk_level=LeakageRiskLevel.MEDIUM,
                            reason=f"High correlation ({correlations[col]:.3f}) with target",
                            recommendation=f"Review '{col}' to ensure it's available at prediction time",
                            correlation_with_target=float(correlations[col])
                        ))

        except Exception as e:
            logger.warning(f"Could not compute correlations for leakage detection: {e}")

        # Sort by risk level
        risk_order = {
            LeakageRiskLevel.HIGH: 0,
            LeakageRiskLevel.MEDIUM: 1,
            LeakageRiskLevel.LOW: 2
        }
        risks.sort(key=lambda r: risk_order[r.risk_level])

        return risks

    def _check_data_quality(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame
    ) -> Tuple[List[str], List[str]]:
        """Check overall data quality."""
        errors = []
        warnings = []

        # Check for high null rates
        null_rates = data.isnull().mean()
        high_null_cols = null_rates[null_rates > 0.5].index.tolist()
        if high_null_cols:
            warnings.append(
                f"{len(high_null_cols)} columns have >50% null values: "
                f"{high_null_cols[:5]}..."
            )

        # Check for constant columns
        nunique = data.nunique()
        constant_cols = nunique[nunique <= 1].index.tolist()
        if constant_cols:
            # Exclude target from this warning
            constant_cols = [c for c in constant_cols if c != playbook.target_column]
            if constant_cols:
                warnings.append(
                    f"{len(constant_cols)} columns are constant (single value): "
                    f"{constant_cols[:5]}..."
                )

        # Check for very high cardinality categorical columns
        object_cols = data.select_dtypes(include=['object']).columns
        for col in object_cols:
            if col != playbook.target_column:
                cardinality = data[col].nunique()
                if cardinality > len(data) * 0.9:
                    warnings.append(
                        f"Column '{col}' has very high cardinality ({cardinality}). "
                        "May not be useful as a feature."
                    )

        # Check feature count
        feature_count = len(data.columns) - 1
        if feature_count < MIN_FEATURES:
            errors.append(
                f"Dataset has only {feature_count} features. "
                f"Minimum required: {MIN_FEATURES}"
            )

        return errors, warnings

    def _compute_target_distribution(
        self,
        playbook: PlaybookConfig,
        data: pd.DataFrame
    ) -> Optional[Dict[str, Any]]:
        """Compute summary statistics for target column."""
        if playbook.target_column not in data.columns:
            return None

        target = data[playbook.target_column]

        if playbook.problem_type == ProblemType.CLASSIFICATION:
            value_counts = target.value_counts()
            return {
                'type': 'categorical',
                'unique_values': int(target.nunique()),
                'distribution': value_counts.head(10).to_dict(),
                'null_count': int(target.isnull().sum()),
                'majority_class': str(value_counts.index[0]) if len(value_counts) > 0 else None,
                'majority_pct': float(value_counts.iloc[0] / len(target) * 100) if len(value_counts) > 0 else 0
            }
        else:
            return {
                'type': 'numeric',
                'min': float(target.min()) if pd.api.types.is_numeric_dtype(target) else None,
                'max': float(target.max()) if pd.api.types.is_numeric_dtype(target) else None,
                'mean': float(target.mean()) if pd.api.types.is_numeric_dtype(target) else None,
                'median': float(target.median()) if pd.api.types.is_numeric_dtype(target) else None,
                'std': float(target.std()) if pd.api.types.is_numeric_dtype(target) else None,
                'null_count': int(target.isnull().sum())
            }

    def _assess_data_readiness(
        self,
        errors: List[str],
        warnings: List[str],
        leakage_risks: List[LeakageRisk],
        row_count: int,
        feature_count: int
    ) -> DataReadinessStatus:
        """Assess overall data readiness for AutoML."""
        if errors:
            return DataReadinessStatus.INSUFFICIENT_DATA

        high_risk_leakage = sum(
            1 for r in leakage_risks if r.risk_level == LeakageRiskLevel.HIGH
        )

        if high_risk_leakage > 0:
            return DataReadinessStatus.REVIEW_NEEDED

        if row_count < MIN_ROWS_FOR_AUTOML or feature_count < MIN_FEATURES:
            return DataReadinessStatus.INSUFFICIENT_DATA

        if len(warnings) > 5 or len(leakage_risks) > 3:
            return DataReadinessStatus.REVIEW_NEEDED

        return DataReadinessStatus.READY


# Global instance
playbook_validator = PlaybookValidator()
