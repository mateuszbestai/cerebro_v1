import asyncio
import csv
import json
import logging
import os
from dataclasses import dataclass, field
import base64
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import text

from app.api.routes.database import active_connections, build_connection_string, ConnectionRequest
from app.config import settings
from app.services.azure_openai import AzureOpenAIService
from app.services.gdm_automl import prepare_automl_metadata

logger = logging.getLogger(__name__)


def _timestamp() -> str:
    return datetime.utcnow().isoformat() + "Z"


@dataclass
class GDMJob:
    job_id: str
    database_id: str
    model_used: str
    status: str = "queued"
    step: str = "idle"
    progress: int = 0
    message: str = "Queued"
    logs: List[Dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=_timestamp)
    completed_at: Optional[str] = None
    artifacts: List[Dict[str, str]] = field(default_factory=list)
    summary: Optional[Dict[str, Any]] = None
    warnings: List[str] = field(default_factory=list)
    output_dir: Optional[Path] = None
    table_count: Optional[int] = None
    database_size_mb: Optional[float] = None
    connection_payload: Optional[Dict[str, Any]] = None
    engine: Any = None
    owns_engine: bool = False

    def append_log(self, step: str, message: str):
        self.logs.append(
            {
                "timestamp": _timestamp(),
                "step": step,
                "message": message,
            }
        )
        self.step = step
        self.message = message


class GDMService:
    """Manage Global Data Model generation jobs."""

    VALID_MODELS = {"gpt-5", "gpt-4.1"}
    MAX_TABLES_WARN = int(os.getenv("GDM_WARNING_TABLES", "250"))
    MAX_DB_SIZE_MB_WARN = float(os.getenv("GDM_WARNING_DB_MB", "8192"))

    def __init__(self):
        self.jobs: Dict[str, GDMJob] = {}
        self.llm_service = AzureOpenAIService()
        self.output_root = self._resolve_output_root()

    def _resolve_output_root(self) -> Path:
        project_root = Path(__file__).resolve().parents[3]
        raw = os.getenv("GDM_OUTPUT_DIR", "data/gdm")
        base = Path(raw)
        if not base.is_absolute():
            base = (project_root / base).resolve()

        try:
            base.mkdir(parents=True, exist_ok=True)
            return base
        except PermissionError:
            fallback = (project_root / "tmp/gdm").resolve()
            try:
                fallback.mkdir(parents=True, exist_ok=True)
            except Exception as exc:  # pragma: no cover - extremely unlikely
                raise RuntimeError(
                    f"Unable to create fallback GDM output directory at {fallback}"
                ) from exc
            logger.warning(
                "Unable to create GDM output directory at %s due to permissions; using %s instead",
                base,
                fallback,
            )
            return fallback

    def _resolve_engine(self, database_id: str, connection_payload: Optional[Dict[str, Any]] = None):
        """Return SQLAlchemy engine, building a temporary one if a payload is provided."""
        if database_id in active_connections:
            return active_connections[database_id]["engine"]

        if not connection_payload:
            raise ValueError("Connection is not active and no credentials were provided.")

        # Build a transient engine using the same helper as /database routes
        try:
            request = ConnectionRequest(**connection_payload)
        except Exception as exc:
            raise ValueError(f"Invalid connection payload: {exc}") from exc

        conn_str = build_connection_string(request)
        from sqlalchemy import create_engine

        return create_engine(conn_str, pool_pre_ping=True)

    async def start_job(
        self,
        *,
        database_id: str,
        user_model: Optional[str] = None,
        connection_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a job, choose the model, and enqueue processing."""
        engine = self._resolve_engine(database_id, connection_payload)
        table_count = await asyncio.to_thread(self._count_tables, engine)
        db_size_mb = await asyncio.to_thread(self._estimate_database_size, engine)
        model_used = self.choose_model(user_model, table_count)

        job_id = str(uuid4())
        job = GDMJob(
            job_id=job_id,
            database_id=database_id,
            model_used=model_used,
            connection_payload=connection_payload,
            table_count=table_count,
            database_size_mb=db_size_mb,
            owns_engine=database_id not in active_connections,
        )
        job.engine = engine
        job.output_dir = self.output_root / database_id / model_used / job_id
        job.output_dir.mkdir(parents=True, exist_ok=True)

        # Size warnings
        if table_count and table_count > self.MAX_TABLES_WARN:
            job.warnings.append(
                f"Database contains {table_count} tables. Generation may take longer than usual."
            )
        if db_size_mb and db_size_mb > self.MAX_DB_SIZE_MB_WARN:
            job.warnings.append(
                f"Database size {db_size_mb:,.0f} MB exceeds the recommended {self.MAX_DB_SIZE_MB_WARN:,.0f} MB limit."
            )

        self.jobs[job_id] = job
        logger.info("Queued GDM job %s for database %s using %s", job_id, database_id, model_used)

        asyncio.create_task(self._run_pipeline(job_id))

        return {
            "job_id": job_id,
            "model_used": model_used,
            "status": job.status,
            "warnings": job.warnings,
        }

    def get_status(self, job_id: str) -> Optional[GDMJob]:
        return self.jobs.get(job_id)

    def choose_model(self, user_choice: Optional[str], table_count: Optional[int]) -> str:
        """Apply recommended model logic with GPT-5 as safe default."""
        if user_choice and user_choice in self.VALID_MODELS:
            return user_choice
        if table_count is not None and table_count <= 50:
            return "gpt-4.1"
        return "gpt-5"

    def _count_tables(self, engine) -> int:
        with engine.connect() as conn:
            result = conn.execute(
                text(
                    """
                    SELECT COUNT(*) 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_TYPE = 'BASE TABLE'
                    """
                )
            )
            return int(result.scalar() or 0)

    def _estimate_database_size(self, engine) -> Optional[float]:
        try:
            with engine.connect() as conn:
                result = conn.execute(
                    text(
                        """
                        SELECT 
                            SUM(CAST(size AS BIGINT)) * 8.0 / 1024 AS size_mb
                        FROM sys.database_files
                        """
                    )
                )
                value = result.scalar()
                return float(value) if value is not None else None
        except Exception as exc:
            logger.debug("Unable to estimate database size: %s", exc)
            return None

    async def _run_pipeline(self, job_id: str):
        job = self.jobs[job_id]
        engine = job.engine or self._resolve_engine(job.database_id, job.connection_payload)
        try:
            job.status = "running"
            job.append_log("metadata_harvest", "Harvesting schema metadata")
            job.progress = 5

            metadata = await asyncio.to_thread(
                self._harvest_metadata, engine
            )
            job.table_count = metadata.get("table_count", job.table_count)
            job.append_log("profiling", "Profiling data samples")
            job.progress = 25

            profiling = await asyncio.to_thread(
                self._profile_data, engine, metadata
            )
            job.append_log("embeddings", "Computing embeddings and glossary candidates")
            job.progress = 45

            embeddings = await asyncio.to_thread(self._compute_embeddings, metadata)
            job.append_log("relationship_inference", "Inferring relationships")
            job.progress = 65

            relationships = await asyncio.to_thread(self._infer_relationships, metadata)
            job.append_log("artifact_generation", "Generating artifacts")
            job.progress = 85

            summary = await self._generate_semantic_summary(
                metadata, relationships, job.model_used
            )

            completion_ts = _timestamp()
            job.completed_at = completion_ts

            artifacts = await asyncio.to_thread(
                self._persist_artifacts,
                job,
                metadata,
                profiling,
                embeddings,
                relationships,
                summary,
            )

            job.artifacts = artifacts
            job.summary = summary
            job.status = "completed"
            job.progress = 100
            job.step = "completed"
            job.message = "Global data model created successfully"
            job.append_log("completed", "Global data model created successfully")
            logger.info("GDM job %s completed", job_id)
        except Exception as exc:
            logger.exception("GDM job %s failed: %s", job_id, exc)
            job.status = "failed"
            job.step = "failed"
            job.message = str(exc)
            job.progress = min(job.progress, 95)
            job.completed_at = _timestamp()
            job.append_log("failed", str(exc))
        finally:
            if job.owns_engine and getattr(job, "engine", None):
                try:
                    job.engine.dispose()
                except Exception as exc:
                    logger.debug("Unable to dispose temporary engine for job %s: %s", job_id, exc)
                job.engine = None

    def _harvest_metadata(self, engine):
        with engine.connect() as conn:
            table_rows = conn.execute(
                text(
                    """
                    SELECT 
                        t.TABLE_SCHEMA AS schema_name,
                        t.TABLE_NAME AS table_name,
                        COUNT(c.COLUMN_NAME) AS column_count
                    FROM INFORMATION_SCHEMA.TABLES t
                    LEFT JOIN INFORMATION_SCHEMA.COLUMNS c
                        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
                    WHERE t.TABLE_TYPE = 'BASE TABLE'
                    GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME
                    """
                )
            ).fetchall()

            column_rows = conn.execute(
                text(
                    """
                    SELECT 
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        CHARACTER_MAXIMUM_LENGTH,
                        COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS
                    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
                    """
                )
            ).fetchall()

            pk_rows = conn.execute(
                text(
                    """
                    SELECT 
                        ku.TABLE_SCHEMA,
                        ku.TABLE_NAME,
                        ku.COLUMN_NAME
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                        ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                    """
                )
            ).fetchall()

            row_counts_map = {}
            try:
                row_count_rows = conn.execute(
                    text(
                        """
                        SELECT 
                            s.name AS schema_name,
                            t.name AS table_name,
                            SUM(p.rows) AS row_count
                        FROM sys.tables t
                        JOIN sys.schemas s ON t.schema_id = s.schema_id
                        JOIN sys.partitions p ON t.object_id = p.object_id
                        WHERE p.index_id IN (0, 1)
                        GROUP BY s.name, t.name
                        """
                    )
                ).fetchall()
                for row in row_count_rows:
                    key = (row._mapping["schema_name"], row._mapping["table_name"])
                    row_counts_map[key] = int(row._mapping["row_count"] or 0)
            except Exception as exc:
                logger.debug("Approximate row counts unavailable: %s", exc)

        pk_map: Dict[tuple, List[str]] = {}
        for pk in pk_rows:
            key = (pk._mapping["TABLE_SCHEMA"], pk._mapping["TABLE_NAME"])
            pk_map.setdefault(key, []).append(pk._mapping["COLUMN_NAME"])

        tables: Dict[tuple, Dict[str, Any]] = {}
        for table in table_rows:
            key = (table._mapping["schema_name"], table._mapping["table_name"])
            tables[key] = {
                "schema": table._mapping["schema_name"],
                "name": table._mapping["table_name"],
                "columns": [],
                "row_count": row_counts_map.get(key),
            }

        for column in column_rows:
            key = (column._mapping["TABLE_SCHEMA"], column._mapping["TABLE_NAME"])
            if key not in tables:
                continue
            tables[key]["columns"].append(
                {
                    "name": column._mapping["COLUMN_NAME"],
                    "type": column._mapping["DATA_TYPE"],
                    "nullable": column._mapping["IS_NULLABLE"] == "YES",
                    "max_length": column._mapping["CHARACTER_MAXIMUM_LENGTH"],
                    "default": column._mapping["COLUMN_DEFAULT"],
                    "is_primary_key": column._mapping["COLUMN_NAME"]
                    in pk_map.get(key, []),
                }
            )

        entities = list(tables.values())
        return {
            "entities": entities,
            "table_count": len(entities),
        }

    def _profile_data(
        self,
        engine,
        metadata: Dict[str, Any],
        sample_tables: int = 5,
        sample_rows: int = 5,
    ):
        profiles = {}
        with engine.connect() as conn:
            for entity in metadata["entities"][:sample_tables]:
                schema = entity["schema"]
                table = entity["name"]
                qualified = f"[{schema}].[{table}]"
                sample_query = text(f"SELECT TOP {sample_rows} * FROM {qualified}")
                try:
                    rows = conn.execute(sample_query).fetchall()
                    data = [dict(row._mapping) for row in rows]
                except Exception:
                    data = []
                profiles[f"{schema}.{table}"] = {
                    "row_count": entity.get("row_count"),
                    "sample_rows": data,
                }
        return profiles

    def _compute_embeddings(self, metadata: Dict[str, Any]):
        """Generate light-weight vectors to mimic embedding stage."""
        vectors = {}
        for entity in metadata["entities"]:
            key = f"{entity['schema']}.{entity['name']}"
            signature = "|".join(sorted([col["name"] for col in entity["columns"]]))
            vectors[key] = {
                "column_signature": signature,
                "dimensionality": len(entity["columns"]),
            }
        return vectors

    def _infer_relationships(self, metadata: Dict[str, Any]):
        entities = {f"{e['schema']}.{e['name']}": e for e in metadata["entities"]}
        relationships: List[Dict[str, Any]] = []

        for key, entity in entities.items():
            for column in entity["columns"]:
                col_name = column["name"]
                if not col_name.lower().endswith("_id"):
                    continue
                referenced_table = col_name[:-3]
                for target_key, target in entities.items():
                    base = target["name"].lower()
                    if base == referenced_table.lower() or base.rstrip("s") == referenced_table.lower():
                        relationships.append(
                            {
                                "from_table": key,
                                "from_column": col_name,
                                "to_table": target_key,
                                "to_column": next(
                                    (c["name"] for c in target["columns"] if c["is_primary_key"]),
                                    None,
                                ),
                                "confidence": 0.72,
                                "strategy": "naming_convention",
                            }
                        )
                        break
        return relationships

    async def _generate_semantic_summary(
        self,
        metadata: Dict[str, Any],
        relationships: List[Dict[str, Any]],
        model_used: str,
    ) -> Dict[str, Any]:
        glossary = {}
        for entity in metadata["entities"]:
            friendly_name = entity["name"].replace("_", " ").title()
            glossary[friendly_name] = {
                "table": f"{entity['schema']}.{entity['name']}",
                "description": f"{friendly_name} entity inferred from schema metadata.",
                "columns": [
                    {
                        "name": col["name"],
                        "description": f"{col['name'].replace('_', ' ').title()} field detected in the source schema.",
                    }
                    for col in entity["columns"]
                ],
            }

        summary = {
            "model_used": model_used,
            "entity_count": len(metadata["entities"]),
            "relationship_count": len(relationships),
            "glossary": glossary,
        }

        if settings.has_openai_config:
            prompt = (
                "You are assisting with a Global Data Model build. "
                "Provide a concise summary (JSON) with keys: overview, highlights, recommendations. "
                f"Entities: {[e['name'] for e in metadata['entities']][:15]}. "
                f"Relationships detected: {len(relationships)}."
            )
            try:
                overview = await self.llm_service.generate_response(
                    prompt,
                    response_format=None,
                    model_id=model_used,
                )
                summary["narrative"] = overview
            except Exception as exc:
                logger.debug("Skipping LLM summary: %s", exc)

        return summary

    def _persist_artifacts(
        self,
        job: GDMJob,
        metadata: Dict[str, Any],
        profiles: Dict[str, Any],
        embeddings: Dict[str, Any],
        relationships: List[Dict[str, Any]],
        summary: Dict[str, Any],
    ) -> List[Dict[str, str]]:
        job_dir = job.output_dir or (self.output_root / job.database_id / job.model_used / job.job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        enriched_entities, automl_guidance = prepare_automl_metadata(
            metadata, relationships, profiles
        )
        metadata["entities"] = enriched_entities

        global_model = {
            "job_id": job.job_id,
            "database_id": job.database_id,
            "generated_at": job.completed_at or _timestamp(),
            "model_used": job.model_used,
            "entities": metadata["entities"],
            "relationships": relationships,
            "profiles": profiles,
            "embeddings": embeddings,
            "summary": summary,
            "automl_guidance": automl_guidance,
        }

        artifacts: List[Dict[str, str]] = []

        def _sanitize(obj: Any):
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            if isinstance(obj, Decimal):
                return float(obj)
            if isinstance(obj, bytes):
                try:
                    return obj.decode("utf-8")
                except UnicodeDecodeError:
                    return base64.b64encode(obj).decode("ascii")
            if isinstance(obj, memoryview):
                return _sanitize(obj.tobytes())
            if isinstance(obj, list):
                return [_sanitize(item) for item in obj]
            if isinstance(obj, dict):
                return {key: _sanitize(value) for key, value in obj.items()}
            return obj

        gm_path = job_dir / "global_model.json"
        gm_path.write_text(json.dumps(_sanitize(global_model), indent=2))
        artifacts.append(self._artifact_entry(job, gm_path))

        glossary_path = job_dir / "glossary.json"
        glossary_payload = summary.get("glossary", {})
        glossary_path.write_text(json.dumps(glossary_payload, indent=2))
        artifacts.append(self._artifact_entry(job, glossary_path))

        relationships_path = job_dir / "relationships.csv"
        with relationships_path.open("w", newline="") as csvfile:
            fieldnames = ["from_table", "from_column", "to_table", "to_column", "confidence", "strategy"]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for rel in relationships:
                writer.writerow(rel)
        artifacts.append(self._artifact_entry(job, relationships_path))

        diagram_path = job_dir / "model.mmd"
        diagram_path.write_text(self._build_mermaid(metadata, relationships))
        artifacts.append(self._artifact_entry(job, diagram_path))

        views_path = job_dir / "conformed_views.sql"
        views_path.write_text(self._build_conformed_views(metadata))
        artifacts.append(self._artifact_entry(job, views_path))

        return artifacts

    def _artifact_entry(self, job: GDMJob, path: Path) -> Dict[str, str]:
        relative = path.relative_to(self.output_root)
        return {
            "name": path.name,
            "path": str(path),
            "download_url": f"/api/v1/gdm/artifact/{job.job_id}/{path.name}",
            "relative_path": str(relative),
        }

    def _build_mermaid(self, metadata: Dict[str, Any], relationships: List[Dict[str, Any]]) -> str:
        def _safe_identifier(value: str) -> str:
            return (
                value.replace(" ", "_")
                .replace("-", "_")
                .replace(".", "_")
                .replace("[", "")
                .replace("]", "")
            )

        def _safe_label(value: str) -> str:
            return value.replace('"', "'")

        lines = ["erDiagram"]

        for entity in sorted(
            metadata["entities"], key=lambda item: (item["schema"], item["name"])
        ):
            label = _safe_identifier(f"{entity['schema']}_{entity['name']}")
            lines.append(f"  {label} {{")
            for column in sorted(entity["columns"], key=lambda col: col["name"]):
                col_type = _safe_label((column.get("type") or "string").upper())
                pk_flag = " PK" if column.get("is_primary_key") else ""
                null_flag = "" if column.get("nullable", True) else " NOT NULL"
                lines.append(f"    {col_type} {column['name']}{pk_flag}{null_flag}")
            lines.append("  }")

        seen_edges = set()
        for rel in sorted(
            relationships,
            key=lambda r: (
                r.get("from_table", ""),
                r.get("to_table", ""),
                r.get("from_column", ""),
            ),
        ):
            left = _safe_identifier(rel["from_table"])
            right = _safe_identifier(rel["to_table"])
            edge_key = (left, right, rel.get("from_column"), rel.get("to_column"))
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            source_col = _safe_label(rel.get("from_column") or "fk")
            target_col = _safe_label(rel.get("to_column") or "pk")
            strategy = rel.get("strategy")
            confidence = rel.get("confidence")
            label_parts = [f"{source_col} -> {target_col}"]
            if strategy:
                label_parts.append(f"({strategy})")
            if confidence is not None:
                label_parts.append(f"{round(confidence * 100)}%")
            label_text = " ".join(label_parts)
            lines.append(f'  {left} ||--o{{ {right} : "{label_text}"')

        return "\n".join(lines)

    def _build_conformed_views(self, metadata: Dict[str, Any], limit: int = 3) -> str:
        statements = []
        for entity in metadata["entities"][:limit]:
            schema = entity["schema"]
            name = entity["name"]
            columns = ", ".join(f"[{col['name']}]" for col in entity["columns"])
            view_name = f"vw_{name}"
            statements.append(
                f"CREATE OR ALTER VIEW [{schema}].[{view_name}] AS\nSELECT {columns}\nFROM [{schema}].[{name}];\nGO\n"
            )
        return "\n".join(statements)


gdm_service = GDMService()
