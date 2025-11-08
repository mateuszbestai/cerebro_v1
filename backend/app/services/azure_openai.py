from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Literal
import logging
import json
import httpx

from langchain_openai import AzureChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

from app.config import settings

logger = logging.getLogger(__name__)

ModelMode = Literal["chat", "completion"]

@dataclass(frozen=True)
class ModelConfig:
    """Configuration for a single Azure OpenAI deployment"""
    id: str
    display_name: str
    mode: ModelMode
    deployment: str
    api_version: str

class AzureOpenAIService:
    """Service for Azure OpenAI interactions with multi-model support"""
    
    def __init__(self):
        self.models = self._build_model_registry()
        if not self.models:
            logger.warning("No Azure OpenAI deployments configured")
        self.default_model_id = self._select_default_model()
        self._llm_cache: Dict[str, Any] = {}
        self._completion_endpoint = (
            settings.AZURE_OPENAI_COMPLETION_ENDPOINT.strip()
            if settings.AZURE_OPENAI_COMPLETION_ENDPOINT else settings.AZURE_OPENAI_ENDPOINT
        )
        
        # Default system prompt for clean responses
        self.default_system_prompt = """
        You are a professional data analyst assistant. Your responses should be:
        - Clear and conversational
        - Focused on insights and value
        - Free from technical jargon
        - Well-formatted with bullet points and lists where appropriate
        - Never mention the tools or processes you use internally
        """
    
    def _build_model_registry(self) -> Dict[str, ModelConfig]:
        """Create the map of available Azure OpenAI deployments."""
        registry: Dict[str, ModelConfig] = {}
        
        if settings.AZURE_OPENAI_DEPLOYMENT_NAME:
            registry[settings.AZURE_OPENAI_CHAT_MODEL_NAME] = ModelConfig(
                id=settings.AZURE_OPENAI_CHAT_MODEL_NAME,
                display_name=f"{settings.AZURE_OPENAI_CHAT_MODEL_NAME} (Chat)",
                mode="chat",
                deployment=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
                api_version=settings.AZURE_OPENAI_API_VERSION,
            )
        
        if settings.AZURE_OPENAI_COMPLETION_DEPLOYMENT_NAME:
            registry[settings.AZURE_OPENAI_COMPLETION_MODEL_NAME] = ModelConfig(
                id=settings.AZURE_OPENAI_COMPLETION_MODEL_NAME,
                display_name=f"{settings.AZURE_OPENAI_COMPLETION_MODEL_NAME} (Chat)",
                mode="chat",
                deployment=settings.AZURE_OPENAI_COMPLETION_DEPLOYMENT_NAME,
                api_version=settings.AZURE_OPENAI_COMPLETION_API_VERSION,
            )
        
        return registry
    
    def _select_default_model(self) -> Optional[str]:
        """Prefer chat-capable models when choosing defaults."""
        if not self.models:
            return None
        for model_id, cfg in self.models.items():
            if cfg.mode == "chat":
                return model_id
        # Fallback to first entry
        return next(iter(self.models))
    
    def resolve_model_id(self, preferred_id: Optional[str]) -> Optional[str]:
        """Return a valid model id, falling back to the default."""
        if preferred_id and preferred_id in self.models:
            return preferred_id
        return self.default_model_id
    
    def get_available_models(self) -> List[Dict[str, Any]]:
        """Expose model metadata for UI/API consumers."""
        models = []
        for model_id, cfg in self.models.items():
            models.append({
                "id": model_id,
                "label": cfg.display_name,
                "mode": cfg.mode,
                "deployment": cfg.deployment,
                "default": model_id == self.default_model_id
            })
        return models
    
    def get_llm(self, model_id: Optional[str] = None, require_chat: bool = False):
        """Return (and cache) a LangChain LLM for the requested model."""
        resolved_id = self.resolve_model_id(model_id)
        if not resolved_id:
            raise ValueError("No Azure OpenAI model is configured")
        
        cfg = self.models[resolved_id]
        if require_chat and cfg.mode != "chat":
            chat_model_id = self._select_default_model()
            if not chat_model_id or self.models[chat_model_id].mode != "chat":
                raise ValueError("No chat-capable Azure OpenAI deployment configured")
            if resolved_id != chat_model_id:
                logger.debug(
                    "Model '%s' does not support chat-only features; falling back to '%s'.",
                    resolved_id,
                    chat_model_id,
                )
            resolved_id = chat_model_id
            cfg = self.models[resolved_id]
        
        if resolved_id in self._llm_cache:
            return self._llm_cache[resolved_id]
        
        llm = AzureChatOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            azure_deployment=cfg.deployment,
            api_version=cfg.api_version,
            api_key=settings.AZURE_OPENAI_API_KEY,
            temperature=1.0,
            max_completion_tokens=4000,
        )
        self._llm_cache[resolved_id] = llm
        return llm
    
    async def generate_response(
        self, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        response_format: Optional[str] = None,
        model_id: Optional[str] = None
    ) -> Any:
        """Generate response from Azure OpenAI"""
        effective_system_prompt = system_prompt if system_prompt else self.default_system_prompt
        resolved_model = self.resolve_model_id(model_id)
        if not resolved_model:
            raise ValueError("No Azure OpenAI model configured")
        cfg = self.models[resolved_model]
        
        try:
            if cfg.mode == "chat":
                llm = self.get_llm(resolved_model)
                messages = [
                    SystemMessage(content=effective_system_prompt),
                    HumanMessage(content=prompt)
                ]
                response = await llm.ainvoke(messages)
                content = response.content
            else:
                content = await self._invoke_responses_api(
                    cfg,
                    effective_system_prompt,
                    prompt
                )
            
            if response_format == "json":
                return json.loads(content)
            return content
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise
    
    async def generate_summary(
        self,
        data: Any,
        max_length: int = 500,
        model_id: Optional[str] = None
    ) -> str:
        """Generate summary of data or results"""
        
        prompt = f"""
        Analyze the following data and provide a clear, insightful summary.
        
        Requirements:
        - Maximum {max_length} words
        - Focus on the most important findings
        - Use bullet points for key insights
        - Include relevant statistics and percentages
        - Suggest actionable next steps if applicable
        - Write in a conversational, business-friendly tone
        
        Data to summarize:
        {data}
        """
        
        return await self.generate_response(prompt, model_id=model_id)
    
    async def _invoke_responses_api(
        self,
        cfg: ModelConfig,
        system_prompt: str,
        user_prompt: str
    ) -> str:
        """Call Azure Responses API for models like GPT-5 Pro."""
        endpoint = (self._completion_endpoint or "").rstrip("/")
        if not endpoint:
            raise ValueError("AZURE_OPENAI_ENDPOINT (or completion endpoint) is not configured")
        
        url = (
            f"{endpoint}/openai/deployments/"
            f"{cfg.deployment}/responses?api-version={cfg.api_version}"
        )
        
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": [{"type": "text", "text": system_prompt}]
                },
                {
                    "role": "user",
                    "content": [{"type": "text", "text": user_prompt}]
                },
            ],
            "temperature": 1.0,
            "max_output_tokens": 1000,
        }
        headers = {
            "api-key": settings.AZURE_OPENAI_API_KEY,
            "Content-Type": "application/json",
        }
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
        except httpx.RequestError as err:
            logger.error("Azure Responses API request error: %s", repr(err))
            raise
        except httpx.HTTPStatusError as err:
            logger.error(
                "Azure Responses API returned %s: %s",
                err.response.status_code,
                err.response.text,
            )
            raise
        
        data = resp.json()
        return self._extract_response_text(data)
    
    def _extract_response_text(self, response_payload: Dict[str, Any]) -> str:
        """Flatten the Azure Responses API structure into raw text."""
        outputs = response_payload.get("output", [])
        if not outputs:
            return ""
        
        parts: List[str] = []
        for item in outputs:
            contents = item.get("content", [])
            for block in contents:
                if block.get("type") == "text" and block.get("text"):
                    parts.append(block["text"])
        return "\n".join(parts).strip()
