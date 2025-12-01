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

    for entity in entities:
        table = _table_id(entity)
        process = _business_process(entity["name"])
        if process:
            entity["business_process"] = process["process"]
            business_processes.append({"table": table, **process})

        for column in entity.get("columns", []):
            is_fk = (table, column["name"]) in foreign_keys
            semantic = _semantic_type(column, is_fk)
            column["semantic_type"] = semantic
            column["semantic_description"] = _semantic_description(semantic, column["name"])
            semantic_columns.append(
                {
                    "table": table,
                    "column": column["name"],
                    "semantic_type": semantic,
                    "description": column.get("semantic_description"),
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
    for rec in recommended_targets:
        rec.pop("_score", None)
    for entity in entities:
        for candidate in entity.get("target_recommendations", []):
            candidate.pop("_score", None)

    guidance = {
        "recommended_targets": recommended_targets[:10],
        "feature_availability": feature_availability,
        "business_processes": business_processes,
        "kpi_columns": kpi_columns,
        "feature_suggestions": feature_suggestions,
        "semantic_columns": semantic_columns,
    }
    return entities, guidance
