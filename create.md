# Global Data Model (GDM) Generation Overview

This document explains how the Cerebro backend assembles a Global Data Model, including each processing phase and the rule-based algorithm that infers relationships between tables. All implementation references point to `backend/app/services/gdm_service.py`.

## 1. Job Orchestration
1. `start_job` receives a `database_id` and optional connection payload, resolves (or builds) a SQLAlchemy engine, and records sizing metadata like table counts and database size (`start_job`, lines 51-164).
2. The service picks an Azure OpenAI model (`gpt-4.1` for ≤50 tables, otherwise `gpt-5`) and enqueues `_run_pipeline` as an async task, persisting warnings when databases look large.
3. `_run_pipeline` is the main state machine. It tracks progress, logs each stage, and disposes transient engines on completion/failure (`_run_pipeline`, lines 200-287).

## 2. Metadata Harvest
The pipeline begins by interrogating SQL Server information schema views:
- `_harvest_metadata` pulls table/column lists plus primary keys via `INFORMATION_SCHEMA.TABLES/COLUMNS` joins.
- Approximate row counts come from `sys.tables`, `sys.schemas`, and `sys.partitions`, enabling quick size estimates without scanning data.
- The output is a list of `entities` with schema/name/columns (including PK flags, nullability, defaults) and optional `row_count` attributes. (See lines 288-386.)

## 3. Lightweight Profiling
`_profile_data` samples up to five tables, reading `SELECT TOP N *` per table. Results populate `profiles[schema.table].sample_rows` alongside cached `row_count` values (lines 388-413). These samples later feed UI insights (e.g., freshness checks).

## 4. Embedding Stub
`_compute_embeddings` does not call an external vector DB; instead, it produces a deterministic signature per table (`column_signature` + column count) to mimic embedding metadata for downstream agents (lines 415-424).

## 5. Relationship Inference Algorithm
The relationship detection is a deterministic heuristic implemented in `_infer_relationships` (lines 426-459):
1. Iterate over each entity’s columns.
2. If a column name ends with `_id`, treat the prefix as a candidate referenced table.
3. Find any entity whose table name matches that prefix (exact or plural-stripped).
4. Emit a relationship record `{from_table, from_column, to_table, to_column, confidence, strategy}` where `to_column` is the first primary key column from the target entity.

This means the algorithm is rule-based, leveraging naming conventions instead of statistical joins. Every inferred edge receives a fixed confidence score of 0.72 and a `strategy` label of `naming_convention`.

## 6. Semantic Summary & Glossary
`_generate_semantic_summary` composes a glossary entry for each entity/column using title-cased names. If Azure OpenAI credentials are configured (`settings.has_openai_config`), it prompts the selected model to generate a narrative (`overview`, `highlights`, `recommendations`) that augments the deterministic summary (lines 461-513 and `app/services/azure_openai.py`).

## 7. Artifact Assembly
`_persist_artifacts` materializes all results under `data/gdm/<database>/<model>/<job_id>/`:
- `global_model.json`: full snapshot of entities, relationships, profiles, embeddings, and summary.
- `glossary.json`: glossary subset.
- `relationships.csv`: tabular export of the inferred edges.
- `model.mmd`: Mermaid ER diagram text produced by `_build_mermaid`.
- `conformed_views.sql`: up to three example `CREATE OR ALTER VIEW` statements from `_build_conformed_views`.

Artifacts are sanitized to serialize datetimes, decimals, and binary blobs, and each file is registered with a download URL for the API (lines 515-616).

## 8. End-to-End Flow
1. Client triggers `/api/v1/gdm/start`, which delegates to `GDMService.start_job`.
2. `_run_pipeline` steps through metadata harvest → profiling → embeddings → relationship inference → summary generation → artifact persistence.
3. UI components read artifacts plus computed stats via `gdm_results_service` (insights, glossary, ER diagrams).

In summary, the “algorithm” behind Cerebro’s GDM is a staged metadata pipeline that combines SQL Server introspection, deterministic naming heuristics for relationship inference, light sampling for profiles, and optional Azure OpenAI summarization for narrative polish. No auto-detected relationships rely on machine learning today—the pipeline favors explainable rules so results remain predictable and auditable.
