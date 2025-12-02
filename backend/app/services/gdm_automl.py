from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional, Sequence, Tuple

NUMERIC_TYPES = {
    "bigint",
    "decimal",
    "float",
    "int",
    "money",
    "numeric",
    "real",
    "smallint",
    "tinyint",
}
TEXT_TYPES = {"char", "nchar", "nvarchar", "text", "varchar"}
TIME_TOKENS = ("occurred", "event", "effective", "created", "updated", "timestamp", "date", "time")
PRICE_TOKENS = ("price", "amount", "cost", "charge", "revenue", "fee", "spend", "payment")
KPI_TOKENS = ("kpi", "metric", "score", "rating", "margin", "profit", "roi", "ltv", "conversion")
CLASSIFICATION_TOKENS = (
    "status",
    "state",
    "flag",
    "churn",
    "active",
    "cancelled",
    "is_",
    "category",
    "segment",
    "tier",
    "bucket",
)
BUSINESS_PROCESS_HINTS: Sequence[Tuple[str, str]] = (
    ("order", "Order to Cash"),
    ("invoice", "Order to Cash"),
    ("payment", "Billing & Payments"),
    ("subscription", "Subscription Lifecycle"),
    ("customer", "Customer 360"),
    ("user", "Identity & Access"),
    ("ticket", "Support"),
    ("incident", "Support"),
    ("shipment", "Fulfillment"),
    ("inventory", "Inventory Management"),
    ("product", "Product Catalog"),
    ("catalog", "Product Catalog"),
    ("supplier", "Procure to Pay"),
    ("purchase", "Procure to Pay"),
    ("expense", "Expense Management"),
    ("lead", "Lead Management"),
    ("opportunity", "Sales Pipeline"),
)

# Minimum requirements for AutoML
MIN_ROWS_FOR_AUTOML = 100
MIN_FEATURES_FOR_AUTOML = 3
IMBALANCE_THRESHOLD = 0.9  # Class is imbalanced if > 90% or < 10%


def _table_id(entity: Dict[str, Any]) -> str:
    return f"{entity['schema']}.{entity['name']}"


def _semantic_description(semantic_type: str, column_name: str) -> Optional[str]:
    if semantic_type == "price":
        return f"{column_name} looks monetary; treat as continuous and currency-aware."
    if semantic_type == "kpi":
        return f"{column_name} resembles a KPI/metric useful as a label or feature."
    if semantic_type == "timestamp":
        return f"{column_name} is a timestamp; aligns feature availability in time."
    if semantic_type == "foreign_key":
        return f"{column_name} links to another entity; useful for joins."
    if semantic_type == "boolean":
        return f"{column_name} is a true/false style indicator."
    if semantic_type == "categorical":
        return f"{column_name} is a categorical/text attribute."
    return None


def _semantic_type(column: Dict[str, Any], is_foreign_key: bool) -> str:
    name = column["name"].lower()
    dtype = (column.get("type") or "").lower()
    if column.get("is_primary_key"):
        return "primary_key"
    if is_foreign_key or name.endswith("_id"):
        return "foreign_key"
    if any(token in name for token in TIME_TOKENS) or "date" in dtype or "time" in dtype:
        return "timestamp"
    if any(token in name for token in PRICE_TOKENS):
        return "price"
    if any(token in name for token in KPI_TOKENS):
        return "kpi"
    if name.startswith("is_") or "flag" in name or dtype in {"bit", "boolean"}:
        return "boolean"
    if dtype in NUMERIC_TYPES:
        return "numeric"
    if dtype in TEXT_TYPES:
        return "categorical"
    return "unknown"


def _business_process(name: str) -> Optional[Dict[str, Any]]:
    lowered = name.lower()
    for token, process in BUSINESS_PROCESS_HINTS:
        if token in lowered:
            return {
                "process": process,
                "confidence": 0.7,
                "reason": f"Table name contains '{token}', mapping to {process}.",
            }
    return None


def _feature_time(entity: Dict[str, Any]) -> Optional[Dict[str, str]]:
    candidates: List[Tuple[int, Dict[str, str]]] = []
    for column in entity.get("columns", []):
        semantic = column.get("semantic_type")
        if semantic != "timestamp":
            continue
        lowered = column["name"].lower()
        if any(token in lowered for token in ("occurred", "event", "effective")):
            priority = 0
        elif any(token in lowered for token in ("created", "ingested", "recorded")):
            priority = 1
        else:
            priority = 2
        candidates.append(
            (
                priority,
                {
                    "column": column["name"],
                    "reason": f"Feature availability aligns with {column['name']}.",
                },
            )
        )
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _target_recommendation(
    entity: Dict[str, Any],
    column: Dict[str, Any],
    semantic_type: str,
    feature_time: Optional[Dict[str, str]],
) -> Optional[Dict[str, Any]]:
    if column.get("is_primary_key"):
        return None

    lowered = column["name"].lower()
    task: Optional[str] = None
    reason: Optional[str] = None
    score = 0.5

    if semantic_type in {"price", "kpi"}:
        task = "regression"
        reason = "Metric/price column detected; well-suited as a continuous label."
        score += 1.2
    elif semantic_type in {"numeric"} and any(token in lowered for token in PRICE_TOKENS + KPI_TOKENS):
        task = "regression"
        reason = "Numeric metric with financial/KPI hints."
        score += 0.8
    elif semantic_type in {"boolean", "categorical"} or any(token in lowered for token in CLASSIFICATION_TOKENS):
        task = "classification"
        reason = "Status/segment style column detected."
        score += 0.6

    if not task:
        return None

    if feature_time:
        score += 0.4
    row_count = entity.get("row_count") or 0
    score += min(row_count / 10_000, 1.0)

    return {
        "table": _table_id(entity),
        "column": column["name"],
        "task": task,
        "reason": reason,
        "semantic_type": semantic_type,
        "business_process": entity.get("business_process"),
        "feature_time": feature_time,
        "row_count": row_count or None,
        "quality": column.get("quality"),
        "_score": score,
    }


def _feature_suggestions(
    entity: Dict[str, Any],
    feature_time: Optional[Dict[str, str]],
) -> Optional[Dict[str, Any]]:
    columns = []
    for column in entity.get("columns", []):
        semantic = column.get("semantic_type")
        if column.get("is_primary_key"):
            continue
        if semantic in {"primary_key", "foreign_key", "timestamp"}:
            continue
        if semantic in {"numeric", "categorical", "boolean", "price", "kpi"}:
            columns.append(column["name"])
    if not columns:
        return None
    return {
        "table": _table_id(entity),
        "features": columns[:10],
        "reason": "Excludes keys/timestamps; keeps categorical + numeric signals.",
        "feature_time": feature_time,
    }


def _compute_column_quality(
    column: Dict[str, Any],
    profile_data: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute data quality metrics for a column from profile samples."""
    quality: Dict[str, Any] = {
        "null_pct": None,
        "cardinality": None,
        "cardinality_ratio": None,
        "sample_stats": None,
    }

    if not profile_data:
        return quality

    sample_rows = profile_data.get("sample_rows", [])
    if not sample_rows:
        return quality

    col_name = column["name"]
    values = [row.get(col_name) for row in sample_rows if col_name in row]

    if not values:
        return quality

    # Calculate null percentage
    null_count = sum(1 for v in values if v is None)
    quality["null_pct"] = round(null_count / len(values), 3) if values else None

    # Calculate cardinality
    non_null_values = [v for v in values if v is not None]
    if non_null_values:
        unique_values = set(str(v) for v in non_null_values)
        quality["cardinality"] = len(unique_values)
        quality["cardinality_ratio"] = round(len(unique_values) / len(non_null_values), 3)

        # Sample statistics based on data type
        dtype = (column.get("type") or "").lower()
        if dtype in NUMERIC_TYPES:
            try:
                numeric_vals = [float(v) for v in non_null_values if v is not None]
                if numeric_vals:
                    quality["sample_stats"] = {
                        "min": round(min(numeric_vals), 2),
                        "max": round(max(numeric_vals), 2),
                        "mean": round(sum(numeric_vals) / len(numeric_vals), 2),
                    }
            except (ValueError, TypeError):
                pass
        elif dtype in TEXT_TYPES or quality["cardinality_ratio"] and quality["cardinality_ratio"] < 0.5:
            # Categorical - show top values
            from collections import Counter
            value_counts = Counter(str(v) for v in non_null_values)
            top_values = value_counts.most_common(5)
            total = len(non_null_values)
            quality["sample_stats"] = {
                "top_values": [
                    {"value": val, "pct": round(count / total, 3)}
                    for val, count in top_values
                ]
            }

    return quality


def _compute_target_warnings(
    entity: Dict[str, Any],
    column: Dict[str, Any],
    task: str,
    profile_data: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Generate warnings about potential issues with using this column as a target."""
    warnings = []
    severity = "low"

    row_count = entity.get("row_count") or 0
    quality = column.get("quality", {})

    # Check minimum rows
    if row_count > 0 and row_count < MIN_ROWS_FOR_AUTOML:
        warnings.append(f"Only {row_count} rows - minimum {MIN_ROWS_FOR_AUTOML} recommended for AutoML")
        severity = "high"

    # Check null percentage
    null_pct = quality.get("null_pct")
    if null_pct is not None and null_pct > 0.3:
        warnings.append(f"High null rate ({null_pct:.0%}) - may need imputation")
        severity = "medium" if severity != "high" else severity

    # Check class imbalance for classification
    if task == "classification" and profile_data:
        sample_stats = quality.get("sample_stats", {})
        top_values = sample_stats.get("top_values", [])
        if top_values and len(top_values) >= 1:
            max_pct = top_values[0].get("pct", 0)
            if max_pct > IMBALANCE_THRESHOLD:
                warnings.append(
                    f"Class imbalance detected ({max_pct:.0%} in majority class) - consider class weights"
                )
                severity = "medium" if severity != "high" else severity

    # Check cardinality for classification
    cardinality = quality.get("cardinality")
    if task == "classification" and cardinality:
        if cardinality > 100:
            warnings.append(
                f"Very high cardinality ({cardinality} classes) - exceeds maximum. "
                "Consider: (1) regression if numeric, (2) grouping classes, or (3) different target"
            )
            severity = "high"
        elif cardinality > 50:
            warnings.append(
                f"High cardinality ({cardinality} classes) - may require long training time. "
                "Consider grouping rare classes or using binning"
            )
            severity = "medium" if severity != "high" else severity
        elif cardinality < 2:
            warnings.append("Only 1 class detected - cannot train classifier")
            severity = "high"

    if not warnings:
        return None

    return {
        "table": _table_id(entity),
        "column": column["name"],
        "warnings": warnings,
        "severity": severity,
    }


def _compute_data_readiness(
    entities: List[Dict[str, Any]],
    recommended_targets: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Assess overall data readiness for AutoML."""
    total_rows = sum(e.get("row_count") or 0 for e in entities)
    total_features = sum(
        len([c for c in e.get("columns", []) if c.get("semantic_type") not in {"primary_key", "foreign_key"}])
        for e in entities
    )

    sufficient_rows = total_rows >= MIN_ROWS_FOR_AUTOML
    sufficient_features = total_features >= MIN_FEATURES_FOR_AUTOML
    has_target_candidates = len(recommended_targets) > 0

    if sufficient_rows and sufficient_features and has_target_candidates:
        recommendation = "Ready for AutoML"
        status = "ready"
    elif not has_target_candidates:
        recommendation = "No suitable target columns detected - review data for prediction objectives"
        status = "review_needed"
    elif not sufficient_rows:
        recommendation = f"Need more data - only {total_rows} rows (minimum {MIN_ROWS_FOR_AUTOML})"
        status = "insufficient_data"
    else:
        recommendation = "Review data quality before proceeding"
        status = "review_needed"

    return {
        "status": status,
        "sufficient_rows": sufficient_rows,
        "sufficient_features": sufficient_features,
        "has_target_candidates": has_target_candidates,
        "total_rows": total_rows,
        "total_features": total_features,
        "recommendation": recommendation,
    }


def prepare_automl_metadata(
    metadata: Dict[str, Any],
    relationships: List[Dict[str, Any]],
    profiles: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    entities = deepcopy(metadata.get("entities", []))
    foreign_keys = {
        (rel.get("from_table"), rel.get("from_column"))
        for rel in relationships
        if rel.get("from_table") and rel.get("from_column")
    }

    semantic_columns: List[Dict[str, Any]] = []
    feature_availability: List[Dict[str, Any]] = []
    business_processes: List[Dict[str, Any]] = []
    kpi_columns: List[Dict[str, Any]] = []
    feature_suggestions: List[Dict[str, Any]] = []
    recommended_targets: List[Dict[str, Any]] = []
    target_warnings: List[Dict[str, Any]] = []

    for entity in entities:
        table = _table_id(entity)
        process = _business_process(entity["name"])
        if process:
            entity["business_process"] = process["process"]
            business_processes.append({"table": table, **process})

        # Get profile data for this table
        profile_data = profiles.get(table)

        for column in entity.get("columns", []):
            is_fk = (table, column["name"]) in foreign_keys
            semantic = _semantic_type(column, is_fk)
            column["semantic_type"] = semantic
            column["semantic_description"] = _semantic_description(semantic, column["name"])

            # Add data quality metrics
            column["quality"] = _compute_column_quality(column, profile_data)

            semantic_columns.append(
                {
                    "table": table,
                    "column": column["name"],
                    "semantic_type": semantic,
                    "description": column.get("semantic_description"),
                    "quality": column["quality"],
                }
            )

        feature_time = _feature_time(entity)
        if feature_time:
            entity["feature_time"] = feature_time
            feature_availability.append({"table": table, **feature_time})

        entity_kpis: List[str] = []
        entity_targets: List[Dict[str, Any]] = []
        for column in entity.get("columns", []):
            semantic = column.get("semantic_type") or "unknown"
            if semantic in {"price", "kpi"}:
                entity_kpis.append(column["name"])
                kpi_columns.append(
                    {
                        "table": table,
                        "column": column["name"],
                        "semantic_type": semantic,
                        "definition": column.get("semantic_description"),
                    }
                )
            candidate = _target_recommendation(entity, column, semantic, feature_time)
            if candidate:
                # Check for target warnings
                warning = _compute_target_warnings(entity, column, candidate["task"], profile_data)
                if warning:
                    target_warnings.append(warning)
                    candidate["has_warnings"] = True
                    candidate["warnings"] = warning["warnings"]
                    candidate["warning_severity"] = warning["severity"]

                entity_targets.append(candidate)
                recommended_targets.append(candidate)

        if entity_targets:
            entity_targets.sort(key=lambda item: item["_score"], reverse=True)
            entity["target_recommendations"] = entity_targets
        if entity_kpis:
            entity["kpi_columns"] = entity_kpis

        features = _feature_suggestions(entity, feature_time)
        if features:
            feature_suggestions.append(features)

    recommended_targets.sort(key=lambda item: item["_score"], reverse=True)

    # Filter out high-risk targets based on quality and warnings
    def _is_eligible(rec: Dict[str, Any]) -> bool:
        warning_severity = rec.get("warning_severity")
        if warning_severity == "high":
            return False
        quality = rec.get("quality") or {}
        null_pct = quality.get("null_pct")
        if null_pct is not None and null_pct > 0.5:
            return False
        if rec.get("task") == "classification":
            cardinality = quality.get("cardinality")
            # More lenient filtering - allow up to 100 classes but prefer lower cardinality
            if cardinality and cardinality > 100:
                return False
        return True

    eligible_targets = [rec for rec in recommended_targets if _is_eligible(rec)]
    fallback_targets = recommended_targets if eligible_targets else recommended_targets[:5]

    for rec in recommended_targets:
        rec.pop("_score", None)
    for entity in entities:
        for candidate in entity.get("target_recommendations", []):
            candidate.pop("_score", None)

    # Compute overall data readiness
    data_readiness = _compute_data_readiness(entities, recommended_targets)

    guidance = {
        "recommended_targets": eligible_targets[:10] if eligible_targets else fallback_targets,
        "feature_availability": feature_availability,
        "business_processes": business_processes,
        "kpi_columns": kpi_columns,
        "feature_suggestions": feature_suggestions,
        "semantic_columns": semantic_columns,
        "target_warnings": target_warnings,
        "data_readiness": data_readiness,
        "recommendation_message": None if eligible_targets else "No high-quality targets detected; review data quality or select a different table/column.",
    }
    return entities, guidance
