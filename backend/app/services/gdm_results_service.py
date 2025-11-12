from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.services.gdm_service import GDMJob, gdm_service


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RelationshipRecord:
    id: str
    from_table: str
    from_column: str
    to_table: str
    to_column: Optional[str]
    confidence: float
    strategy: Optional[str] = None
    status: str = "candidate"
    evidence: Optional[str] = None
    preview_sql: Optional[str] = None
    test_status: Optional[Dict[str, Any]] = None
    last_tested: Optional[str] = None


class GDMResultsService:
    """Derive human-friendly results from generated Global Data Model artifacts."""

    REQUIRED_ARTIFACTS = [
        "global_model.json",
        "glossary.json",
        "relationships.csv",
        "model.mmd",
        "conformed_views.sql",
    ]
    PII_TOKENS = ("ssn", "email", "phone", "address", "name", "dob", "credit", "tax", "iban")
    TIMESTAMP_HINTS = ("updated", "modified", "ingested", "loaded", "timestamp")

    def __init__(
        self,
        *,
        gdm_service_ref=gdm_service,
        base_dir: Optional[Path] = None,
    ):
        self._gdm_service = gdm_service_ref
        self._base_dir = Path(base_dir) if base_dir else self._gdm_service.output_root
        self._state_dir = self._base_dir / "_state"
        self._state_dir.mkdir(parents=True, exist_ok=True)
        self._relationship_state_dir = self._state_dir / "relationships"
        self._relationship_state_dir.mkdir(parents=True, exist_ok=True)
        self._ai_usage_file = self._state_dir / "ai_usage.json"
        self._ai_lock = Lock()
        self._relationship_lock = Lock()

    # -------------------------------------------------------------------------
    # Public helpers
    # -------------------------------------------------------------------------
    def get_results(self, job_id: str) -> Dict[str, Any]:
        job_dir = self._resolve_job_dir(job_id)
        global_model = self._load_json(job_dir / "global_model.json")
        entities = global_model.get("entities", [])
        relationships = global_model.get("relationships", [])

        nodes, edges = self._build_graph(entities, relationships, global_model.get("profiles", {}))
        stats = self._build_stats(nodes, edges)
        artifacts = self._list_artifacts(job_id, job_dir)
        missing = [name for name in self.REQUIRED_ARTIFACTS if name not in {a["name"] for a in artifacts}]
        job = self._gdm_service.get_status(job_id)
        relationship_review = self.get_relationship_review(job_id, global_model)

        ai_state = self.get_use_for_ai(job_id)
        summary = global_model.get("summary") or {}

        return {
            "job_id": job_id,
            "database_id": getattr(job, "database_id", None) or global_model.get("database_id"),
            "model_used": getattr(job, "model_used", None) or global_model.get("model_used"),
            "completed_at": getattr(job, "completed_at", None) or global_model.get("generated_at"),
            "graph": {"nodes": nodes, "edges": edges},
            "entity_count": len(nodes),
            "relationship_count": len(edges),
            "summary": summary,
            "artifacts": artifacts,
            "missing_artifacts": missing,
            "warnings": getattr(job, "warnings", []) or [],
            "timeline": self._build_timeline(job_id, job, global_model),
            "stats": stats,
            "glossary_terms": len(summary.get("glossary", {})),
            "ai_usage_enabled": ai_state["enabled"] if ai_state else False,
            "relationship_overview": {
                "confirmed": len(relationship_review["confirmed"]),
                "candidates": len(relationship_review["candidates"]),
            },
        }

    def get_narrative_summary(self, job_id: str) -> Dict[str, Any]:
        job_dir = self._resolve_job_dir(job_id)
        global_model = self._load_json(job_dir / "global_model.json")
        entities = global_model.get("entities", [])
        relationships = global_model.get("relationships", [])
        nodes, edges = self._build_graph(entities, relationships, global_model.get("profiles", {}))

        top_entities = [node["label"] for node in sorted(nodes, key=lambda n: n["degree"], reverse=True)[:3]]
        notable_measures = self._detect_notable_measures(entities)

        summary = global_model.get("summary", {})
        overview = summary.get("narrative")
        if not overview:
            overview = self._compose_overview(len(nodes), len(edges), top_entities, notable_measures)

        return {
            "job_id": job_id,
            "entity_count": len(nodes),
            "relationship_count": len(edges),
            "summary": overview,
            "top_entities": top_entities,
            "notable_measures": notable_measures,
        }

    def get_insights(self, job_id: str) -> List[Dict[str, Any]]:
        job_dir = self._resolve_job_dir(job_id)
        global_model = self._load_json(job_dir / "global_model.json")
        entities = global_model.get("entities", [])
        relationships = global_model.get("relationships", [])
        profiles = global_model.get("profiles", {})

        nodes, _ = self._build_graph(entities, relationships, profiles)
        largest = sorted(
            [node for node in nodes if node.get("row_count")],
            key=lambda n: n.get("row_count", 0),
            reverse=True,
        )[:3]
        most_connected = sorted(nodes, key=lambda n: n["degree"], reverse=True)[:3]
        missing_fks = self._detect_missing_foreign_keys(entities, relationships)
        pii_columns = self._detect_pii_columns(entities)
        freshness = self._estimate_freshness(profiles)

        insights: List[Dict[str, Any]] = []
        if largest:
            top = largest[0]
            insights.append(
                {
                    "id": "largest_tables",
                    "title": "Largest Tables",
                    "value": f"{top['label']} · {top.get('row_count', 0):,} rows",
                    "description": "Biggest storage footprint; consider partitioning or summarizing.",
                    "severity": "info",
                    "affected_nodes": [node["id"] for node in largest],
                    "supporting": [
                        {"label": node["label"], "value": f"{node.get('row_count', 0):,} rows"} for node in largest
                    ],
                }
            )

        if most_connected:
            insights.append(
                {
                    "id": "most_connected",
                    "title": "Most Connected Entities",
                    "value": ", ".join(node["label"] for node in most_connected),
                    "description": "High-degree hubs are ideal anchors for exploration and lineage.",
                    "severity": "info",
                    "affected_nodes": [node["id"] for node in most_connected],
                }
            )

        if missing_fks:
            sample = missing_fks[:3]
            insights.append(
                {
                    "id": "missing_foreign_keys",
                    "title": "Missing Foreign Keys",
                    "value": f"{len(missing_fks)} columns",
                    "description": "Columns look like identifiers but no relationship was confirmed.",
                    "severity": "warning",
                    "affected_nodes": list({col["table"] for col in sample}),
                    "details": sample,
                }
            )

        if pii_columns:
            sample = pii_columns[:3]
            insights.append(
                {
                    "id": "pii_columns",
                    "title": "PII Detected",
                    "value": f"{len(pii_columns)} columns",
                    "description": "Review masking strategy before exposing these columns.",
                    "severity": "warning",
                    "affected_nodes": list({item["table"] for item in sample}),
                    "details": sample,
                }
            )

        insights.append(
            {
                "id": "freshness",
                "title": "Freshness Snapshot",
                "value": freshness["label"],
                "description": freshness["description"],
                "severity": freshness["severity"],
                "affected_nodes": freshness.get("tables", []),
            }
        )

        coverage = self._relationship_coverage(len(nodes), len(relationships))
        insights.append(
            {
                "id": "relationship_coverage",
                "title": "Relationship Coverage",
                "value": f"{coverage:.0%}",
                "description": "Confirmed links vs. theoretical maximum.",
                "severity": "info",
                "affected_nodes": [],
            }
        )

        return insights

    def get_relationship_review(
        self,
        job_id: str,
        global_model: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        job_dir = self._resolve_job_dir(job_id)
        model = global_model or self._load_json(job_dir / "global_model.json")
        relationships = model.get("relationships", [])

        state = self._read_relationship_state(job_id)
        records = [self._build_relationship_record(rel, state.get(self._rel_id(rel))) for rel in relationships]

        confirmed = [asdict(record) for record in records if record.status == "confirmed"]
        candidates = [asdict(record) for record in records if record.status != "confirmed"]

        confirmed.sort(key=lambda r: r["confidence"], reverse=True)
        candidates.sort(key=lambda r: r["confidence"], reverse=True)

        return {
            "job_id": job_id,
            "confirmed": confirmed,
            "candidates": candidates,
        }

    def confirm_relationships(self, job_id: str, relationship_ids: Sequence[str]) -> Dict[str, Any]:
        if not relationship_ids:
            return self.get_relationship_review(job_id)
        with self._relationship_lock:
            state = self._read_relationship_state(job_id)
            for rel_id in relationship_ids:
                state[rel_id] = "confirmed"
            self._write_relationship_state(job_id, state)
        return self.get_relationship_review(job_id)

    def get_use_for_ai(self, job_id: str) -> Optional[Dict[str, Any]]:
        data = self._read_json(self._ai_usage_file)
        state = data.get(job_id)
        if not state:
            return None
        return {"job_id": job_id, **state}

    def set_use_for_ai(self, job_id: str, enabled: bool) -> Dict[str, Any]:
        # Ensure artifacts exist before setting the flag
        self._resolve_job_dir(job_id)
        with self._ai_lock:
            data = self._read_json(self._ai_usage_file)
            data[job_id] = {"enabled": enabled, "updated_at": _utc_now()}
            self._write_json(self._ai_usage_file, data)
        return {"job_id": job_id, **data[job_id]}

    def find_artifact_path(self, job_id: str, artifact_name: str) -> Path:
        job_dir = self._resolve_job_dir(job_id)
        candidate = job_dir / artifact_name
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Artifact {artifact_name} not found for job {job_id}")

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------
    def _resolve_job_dir(self, job_id: str) -> Path:
        job: Optional[GDMJob] = self._gdm_service.get_status(job_id)
        if job and job.output_dir:
            path = Path(job.output_dir)
            if path.exists():
                return path
        for candidate in self._base_dir.rglob(job_id):
            if candidate.is_dir():
                return candidate
        raise FileNotFoundError(f"GDM artifacts for job {job_id} are not available.")

    def _load_json(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            raise FileNotFoundError(f"Missing artifact {path.name}")
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _read_json(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write_json(self, path: Path, payload: Dict[str, Any]):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)

    def _list_artifacts(self, job_id: str, job_dir: Path) -> List[Dict[str, Any]]:
        job = self._gdm_service.get_status(job_id)
        if job and job.artifacts:
            return job.artifacts

        artifacts: List[Dict[str, Any]] = []
        for item in job_dir.iterdir():
            if not item.is_file():
                continue
            artifacts.append(
                {
                    "name": item.name,
                    "path": str(item),
                    "download_url": f"/api/v1/gdm/artifact/{job_id}/{item.name}",
                    "relative_path": str(item.relative_to(self._base_dir)),
                }
            )
        artifacts.sort(key=lambda a: a["name"])
        return artifacts

    def _build_graph(
        self,
        entities: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        profiles: Dict[str, Any],
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        nodes: List[Dict[str, Any]] = []
        node_lookup: Dict[str, Dict[str, Any]] = {}
        for entity in entities:
            node_id = f"{entity['schema']}.{entity['name']}"
            profile = profiles.get(node_id)
            node = {
                "id": node_id,
                "label": entity["name"].replace("_", " ").title(),
                "schema": entity["schema"],
                "name": entity["name"],
                "type": self._infer_entity_type(entity),
                "row_count": entity.get("row_count"),
                "column_count": len(entity.get("columns", [])),
                "columns": entity.get("columns", []),
                "degree": 0,
                "tags": [],
                "profile": profile,
            }
            node_lookup[node_id] = node
            nodes.append(node)

        edges: List[Dict[str, Any]] = []
        for rel in relationships:
            src = rel.get("from_table")
            tgt = rel.get("to_table")
            if src in node_lookup:
                node_lookup[src]["degree"] += 1
            if tgt in node_lookup:
                node_lookup[tgt]["degree"] += 1
            edges.append(
                {
                    "id": self._rel_id(rel),
                    "source": src,
                    "target": tgt,
                    "label": f"{rel.get('from_column')} ➜ {rel.get('to_column') or 'unknown'}",
                    "confidence": rel.get("confidence"),
                    "strategy": rel.get("strategy"),
                }
            )

        self._apply_layout(nodes)
        return nodes, edges

    def _apply_layout(self, nodes: List[Dict[str, Any]]):
        total = max(len(nodes), 1)
        radius = max(260, total * 24)
        for idx, node in enumerate(nodes):
            angle = (2 * math.pi * idx) / total
            node["position"] = {
                "x": round(math.cos(angle) * radius, 2),
                "y": round(math.sin(angle) * radius, 2),
            }

    def _build_stats(self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Dict[str, Any]:
        types = [node["type"] for node in nodes]
        facts = sum(1 for t in types if t == "fact")
        dims = sum(1 for t in types if t == "dimension")
        avg_degree = sum(node["degree"] for node in nodes) / len(nodes) if nodes else 0
        isolated = sum(1 for node in nodes if node["degree"] == 0)
        return {
            "facts": facts,
            "dimensions": dims,
            "avg_degree": round(avg_degree, 2),
            "max_degree": max((node["degree"] for node in nodes), default=0),
            "isolated_nodes": isolated,
        }

    def _infer_entity_type(self, entity: Dict[str, Any]) -> str:
        name = entity["name"].lower()
        if name.startswith("fact") or name.endswith("_fact"):
            return "fact"
        if name.startswith("dim") or name.startswith("dim_") or name.endswith("_dim"):
            return "dimension"
        if entity.get("row_count", 0) > 1_000_000:
            return "fact"
        return "dimension"

    def _build_timeline(self, job_id: str, job: Optional[GDMJob], global_model: Dict[str, Any]) -> List[Dict[str, Any]]:
        steps = [
            ("metadata_harvest", "Analyzed schema metadata"),
            ("profiling", "Profiled representative samples"),
            ("embeddings", "Generated glossary candidates"),
            ("relationship_inference", "Mapped joins and foreign keys"),
            ("artifact_generation", "Produced shareable artifacts"),
            ("completed", "Results available"),
        ]
        logs = getattr(job, "logs", []) or []
        log_map = {entry.get("step"): entry for entry in logs}
        timeline: List[Dict[str, Any]] = []
        for step_id, label in steps:
            log_entry = log_map.get(step_id)
            timeline.append(
                {
                    "id": step_id,
                    "label": label,
                    "description": log_entry["message"] if log_entry else label,
                    "timestamp": log_entry["timestamp"] if log_entry else None,
                    "status": self._step_status(step_id, job),
                }
            )

        # Append summary node
        entity_total = len(global_model.get("entities", []))
        rel_total = len(global_model.get("relationships", []))
        timeline.append(
            {
                "id": "summary",
                "label": "Artifacts ready",
                "description": f"{entity_total} entities · {rel_total} relationships",
                "timestamp": getattr(job, "completed_at", None) or global_model.get("generated_at"),
                "status": "done",
            }
        )
        return timeline

    def _step_status(self, current_step: str, job: Optional[GDMJob]) -> str:
        if not job:
            return "unknown"
        if job.step == current_step and job.status == "running":
            return "in_progress"
        if job.status == "completed":
            return "done"
        if job.status == "failed":
            return "failed"
        steps_order = [
            "metadata_harvest",
            "profiling",
            "embeddings",
            "relationship_inference",
            "artifact_generation",
            "completed",
        ]
        current_index = steps_order.index(current_step)
        job_index = steps_order.index(job.step) if job.step in steps_order else -1
        return "pending" if job_index < current_index else "done"

    def _compose_overview(
        self,
        entity_count: int,
        relationship_count: int,
        top_entities: List[str],
        measures: List[str],
    ) -> str:
        parts = [
            f"The global model spans {entity_count} entities linked by {relationship_count} relationships.",
        ]
        if top_entities:
            parts.append(f"{', '.join(top_entities)} act as the most connected hubs.")
        if measures:
            parts.append(f"Notable measures include {', '.join(measures[:3])}.")
        return " ".join(parts)

    def _detect_notable_measures(self, entities: List[Dict[str, Any]]) -> List[str]:
        candidates: List[str] = []
        measure_tokens = ("amount", "revenue", "score", "total", "qty", "quantity", "cost")
        for entity in entities:
            for column in entity.get("columns", []):
                name = column["name"].lower()
                if any(token in name for token in measure_tokens):
                    candidates.append(column["name"])
        return candidates

    def _detect_missing_foreign_keys(
        self,
        entities: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
    ) -> List[Dict[str, str]]:
        related = {f"{rel['from_table']}.{rel['from_column']}" for rel in relationships}
        missing: List[Dict[str, str]] = []
        for entity in entities:
            table_id = f"{entity['schema']}.{entity['name']}"
            for column in entity.get("columns", []):
                qualified = f"{table_id}.{column['name']}"
                if qualified in related:
                    continue
                if column["name"].lower().endswith("_id") and not column.get("is_primary_key"):
                    missing.append(
                        {"table": table_id, "column": column["name"], "reason": "No outbound relationship"}
                    )
        return missing

    def _detect_pii_columns(self, entities: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        pii: List[Dict[str, str]] = []
        for entity in entities:
            table_id = f"{entity['schema']}.{entity['name']}"
            for column in entity.get("columns", []):
                name = column["name"].lower()
                if any(token in name for token in self.PII_TOKENS):
                    pii.append({"table": table_id, "column": column["name"]})
        return pii

    def _estimate_freshness(self, profiles: Dict[str, Any]) -> Dict[str, Any]:
        latest: Optional[datetime] = None
        table: Optional[str] = None
        for table_id, profile in profiles.items():
            rows = profile.get("sample_rows") or []
            if not rows:
                continue
            sample = rows[0]
            for key, value in sample.items():
                if not isinstance(value, str):
                    continue
                lowered = key.lower()
                if not any(hint in lowered for hint in self.TIMESTAMP_HINTS):
                    continue
                try:
                    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if not latest or parsed > latest:
                    latest = parsed
                    table = table_id
        if not latest:
            return {
                "label": "Unknown",
                "description": "No timestamp columns observed in samples.",
                "severity": "info",
                "tables": [],
            }
        delta = datetime.now(timezone.utc) - latest
        hours = delta.total_seconds() / 3600
        if hours <= 24:
            label = "< 24h"
            severity = "info"
        elif hours <= 72:
            label = "< 72h"
            severity = "warning"
        else:
            label = "> 72h"
            severity = "warning"
        return {
            "label": label,
            "description": f"Latest update {int(hours)}h ago in {table}.",
            "severity": severity,
            "tables": [table] if table else [],
        }

    def _relationship_coverage(self, node_count: int, relationship_count: int) -> float:
        if node_count <= 1:
            return 0.0
        theoretical_max = node_count * (node_count - 1)
        return min(relationship_count / theoretical_max, 1.0)

    def _rel_id(self, rel: Dict[str, Any]) -> str:
        return f"{rel.get('from_table')}::{rel.get('from_column')}->{rel.get('to_table')}::{rel.get('to_column')}"

    def _build_relationship_record(
        self,
        rel: Dict[str, Any],
        status: Optional[str],
    ) -> RelationshipRecord:
        rel_id = self._rel_id(rel)
        preview = self._preview_sql(rel)
        evidence = f"Inferred via {rel.get('strategy') or 'heuristics'}"
        test_status = {
            "status": "pass" if (rel.get("confidence") or 0) >= 0.7 else "warn",
            "message": "Row sample joined successfully" if (rel.get("confidence") or 0) >= 0.7 else "Needs verification",
        }
        return RelationshipRecord(
            id=rel_id,
            from_table=rel.get("from_table"),
            from_column=rel.get("from_column"),
            to_table=rel.get("to_table"),
            to_column=rel.get("to_column"),
            confidence=float(rel.get("confidence") or 0),
            strategy=rel.get("strategy"),
            status=status or "candidate",
            evidence=evidence,
            preview_sql=preview,
            test_status=test_status,
            last_tested=_utc_now(),
        )

    def _preview_sql(self, rel: Dict[str, Any]) -> str:
        left = rel.get("from_table")
        right = rel.get("to_table")
        from_column = rel.get("from_column")
        to_column = rel.get("to_column") or "<missing>"
        return (
            f"SELECT TOP 5 *\nFROM {left} AS src\nJOIN {right} AS tgt\n  ON src.{from_column} = tgt.{to_column};"
        )

    def _read_relationship_state(self, job_id: str) -> Dict[str, str]:
        path = self._relationship_state_dir / f"{job_id}.json"
        return self._read_json(path)

    def _write_relationship_state(self, job_id: str, payload: Dict[str, str]):
        path = self._relationship_state_dir / f"{job_id}.json"
        self._write_json(path, payload)


gdm_results_service = GDMResultsService()
