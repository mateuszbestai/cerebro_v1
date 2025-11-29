import json
import logging
import typing
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.config import settings
from app.services.azure_openai import AzureOpenAIService

logger = logging.getLogger(__name__)

# Marshmallow 3.x no longer exposes `_T` from `marshmallow.fields`, but
# azure-ai-ml still imports it. Patch it in before importing azure-ai-ml.
try:
    import marshmallow.fields as _mm_fields
    import marshmallow.validate as _mm_validate

    if not hasattr(_mm_fields, "_T"):
        _mm_fields._T = getattr(_mm_validate, "_T", typing.TypeVar("_T"))  # type: ignore[attr-defined]
except Exception as patch_exc:  # pragma: no cover - best-effort shim
    logger.debug("Failed to patch marshmallow for azure-ai-ml: %s", patch_exc)

try:
    from azure.identity import DefaultAzureCredential, ClientSecretCredential, CredentialUnavailableError
    from azure.core.exceptions import ClientAuthenticationError
    from azure.ai.ml import MLClient, automl, Input
    from azure.ai.ml.constants import AssetTypes

    AZURE_ML_AVAILABLE = True
except ImportError:
    AZURE_ML_AVAILABLE = False
    MLClient = None  # type: ignore
    CredentialUnavailableError = ClientAuthenticationError = Exception  # type: ignore
    logger.warning("azure-ai-ml not installed; AutoML features will run in stub mode.")


@dataclass
class AutoMLJobConfig:
    """Configuration for launching an Azure AutoML job."""

    task: str
    target_column: str
    training_data: str
    validation_data: Optional[str] = None
    metric: Optional[str] = None
    time_limit_minutes: int = 30
    max_trials: int = 10
    compute_name: Optional[str] = None
    experiment_name: Optional[str] = None
    primary_name: Optional[str] = None
    tags: Dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "AutoMLJobConfig":
        return cls(
            task=payload.get("task", "classification"),
            target_column=payload["target_column"],
            training_data=payload["training_data"],
            validation_data=payload.get("validation_data"),
            metric=payload.get("metric"),
            time_limit_minutes=int(payload.get("time_limit_minutes", 30)),
            max_trials=int(payload.get("max_trials", 10)),
            compute_name=payload.get("compute_name") or settings.AZURE_ML_COMPUTE_NAME,
            experiment_name=payload.get("experiment_name")
            or settings.AZURE_ML_EXPERIMENT_PREFIX,
            primary_name=payload.get("name"),
            tags=payload.get("tags") or {},
        )


class AutoMLService:
    """Facade for Azure ML AutoML jobs with graceful degradation when Azure ML is unavailable."""

    def __init__(self) -> None:
        self._ml_client: Optional[MLClient] = None
        self._azure_available = AZURE_ML_AVAILABLE and settings.has_azure_ml_config
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._llm = AzureOpenAIService()

    def is_configured(self) -> bool:
        return self._azure_available

    def _get_credential(self):
        if settings.AZURE_ML_CLIENT_ID and settings.AZURE_ML_CLIENT_SECRET and settings.AZURE_ML_TENANT_ID:
            return ClientSecretCredential(
                tenant_id=settings.AZURE_ML_TENANT_ID,
                client_id=settings.AZURE_ML_CLIENT_ID,
                client_secret=settings.AZURE_ML_CLIENT_SECRET,
            )
        return DefaultAzureCredential(exclude_interactive_browser_credential=True)

    def _verify_credential(self, credential) -> bool:
        """Eagerly validate that the credential can fetch a token."""
        if not credential:
            return False
        try:
            credential.get_token("https://management.azure.com/.default")
            return True
        except (CredentialUnavailableError, ClientAuthenticationError) as exc:
            logger.warning("Azure ML credential unavailable: %s", exc)
            return False
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Azure ML credential validation failed: %s", exc)
            return False

    def _get_ml_client(self) -> Optional[MLClient]:
        if not self._azure_available:
            return None
        if self._ml_client:
            return self._ml_client
        try:
            credential = self._get_credential()
            if not self._verify_credential(credential):
                self._azure_available = False
                return None
            self._ml_client = MLClient(
                credential=credential,
                subscription_id=settings.AZURE_ML_SUBSCRIPTION_ID,
                resource_group=settings.AZURE_ML_RESOURCE_GROUP,
                workspace_name=settings.AZURE_ML_WORKSPACE_NAME,
            )
            return self._ml_client
        except Exception as exc:
            logger.error(f"Failed to initialize Azure ML client: {exc}")
            self._azure_available = False
            return None

    def _stub_job(self, job_name: str, created_at: str, message: str) -> Dict[str, Any]:
        """Record and return a stubbed job result when Azure ML is unavailable."""
        summary = "AutoML stub run completed locally."
        self._jobs[job_name] = {
            "status": "completed",
            "job_id": job_name,
            "created_at": created_at,
            "message": message,
            "metrics": {},
            "summary": summary,
            "local": True,
        }
        return {"job_id": job_name, "status": "completed", "summary": summary}

    async def submit_job(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Submit an AutoML job to Azure ML. Falls back to a stub job if unavailable."""
        config = AutoMLJobConfig.from_payload(payload)
        job_name = config.primary_name or f"{settings.AZURE_ML_EXPERIMENT_PREFIX}-{uuid.uuid4().hex[:10]}"
        created_at = datetime.utcnow().isoformat()

        ml_client = self._get_ml_client()
        if not ml_client:
            return self._stub_job(
                job_name,
                created_at,
                "Azure ML not configured or credentials unavailable; returning stubbed result.",
            )

        try:
            training_input = Input(type=AssetTypes.URI_FILE, path=config.training_data)
            validation_input = (
                Input(type=AssetTypes.URI_FILE, path=config.validation_data)
                if config.validation_data
                else None
            )
            compute_name = config.compute_name or settings.AZURE_ML_COMPUTE_NAME or None

            job_kwargs = dict(
                compute=compute_name,
                experiment_name=config.experiment_name,
                # azure-ai-ml expects target_column_name (target_column is not recognized)
                target_column_name=config.target_column,
                training_data=training_input,
                primary_metric=config.metric,
                tags=config.tags,
            )
            if validation_input:
                job_kwargs["validation_data"] = validation_input

            # Drop empty values to avoid passing unexpected kwargs to the SDK
            job_kwargs = {k: v for k, v in job_kwargs.items() if v not in (None, "")}

            if config.task.lower() == "regression":
                aml_job = automl.regression(**job_kwargs)
            elif config.task.lower() == "forecasting":
                aml_job = automl.forecasting(**job_kwargs)
            else:
                aml_job = automl.classification(**job_kwargs)

            # Name cannot be passed as a kwarg for some SDK versions
            aml_job.name = job_name

            aml_job.set_limits(
                timeout_minutes=config.time_limit_minutes,
                max_trials=config.max_trials,
            )

            submitted = ml_client.jobs.create_or_update(aml_job)
            self._jobs[job_name] = {
                "status": getattr(submitted, "status", "submitted"),
                "job_id": getattr(submitted, "name", job_name),
                "created_at": created_at,
                "local": False,
            }
            return {"job_id": getattr(submitted, "name", job_name), "status": getattr(submitted, "status", "submitted")}
        except (CredentialUnavailableError, ClientAuthenticationError) as exc:
            logger.error("AutoML credential failure; falling back to stub: %s", exc)
            self._azure_available = False
            return self._stub_job(
                job_name,
                created_at,
                "Azure ML credentials unavailable. Ensure AZURE_ML_CLIENT_ID/SECRET/TENANT_ID are set or run 'az login'.",
            )
        except Exception as exc:
            logger.error(f"AutoML job submission failed: {exc}")
            self._jobs[job_name] = {
                "status": "failed",
                "job_id": job_name,
                "created_at": created_at,
                "error": str(exc),
                "local": True,
            }
            return {"job_id": job_name, "status": "failed", "error": str(exc)}

    async def get_job(self, job_id: str) -> Dict[str, Any]:
        """Fetch job status/metrics, with LLM summary if possible."""
        if job_id in self._jobs and self._jobs[job_id].get("local"):
            return self._jobs[job_id]

        ml_client = self._get_ml_client()
        if not ml_client:
            return self._jobs.get(job_id, {"status": "unknown", "error": "Azure ML not configured"})

        try:
            job = ml_client.jobs.get(job_id)
            status = getattr(job, "status", "unknown")
            metrics = {}
            try:
                details = ml_client.jobs.get_details(job_id)
                metrics = getattr(details, "properties", {}).get("primary_metrics", {}) or {}
            except Exception as metric_exc:
                logger.debug(f"Unable to fetch metrics for job {job_id}: {metric_exc}")

            summary = None
            if status.lower() == "completed":
                summary = await self._summarize_metrics(job_id, metrics)

            response = {
                "status": status,
                "job_id": job_id,
                "metrics": metrics,
                "summary": summary,
            }
            self._jobs[job_id] = {**self._jobs.get(job_id, {}), **response}
            return response
        except Exception as exc:
            logger.error(f"Error fetching job status for {job_id}: {exc}")
            return {"status": "failed", "job_id": job_id, "error": str(exc)}

    async def _summarize_metrics(self, job_id: str, metrics: Dict[str, Any]) -> Optional[str]:
        """Use Azure OpenAI to translate metrics into a short explanation."""
        if not metrics:
            return None
        try:
            prompt = f"""
            You are summarizing an Azure AutoML run.
            Job ID: {job_id}
            Metrics (JSON):
            {json.dumps(metrics, indent=2)}

            Provide a concise, non-technical summary for a business user.
            - Call out the primary metric and what it means.
            - Mention any overfitting risks if validation metrics lag.
            - Suggest the next action (e.g., deploy, retrain with more data).
            """
            return await self._llm.generate_response(prompt)
        except Exception as exc:
            logger.debug(f"Failed to summarize metrics for {job_id}: {exc}")
            return None
