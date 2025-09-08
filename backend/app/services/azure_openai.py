from langchain_openai import AzureChatOpenAI
from langchain.schema import HumanMessage, SystemMessage
from typing import Optional, Dict, Any, List
import logging

from app.config import settings

logger = logging.getLogger(__name__)

class AzureOpenAIService:
    """Service for Azure OpenAI interactions"""
    
    def __init__(self):
        self.llm = AzureChatOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            azure_deployment=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            api_key=settings.AZURE_OPENAI_API_KEY,
            temperature=0.7,
            max_tokens=4000
        )
    
    def get_llm(self):
        """Get the LLM instance for use in agents"""
        return self.llm
    
    async def generate_response(
        self, 
        prompt: str, 
        system_prompt: Optional[str] = None,
        response_format: Optional[str] = None
    ) -> Any:
        """Generate response from Azure OpenAI"""
        
        messages = []
        
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        
        messages.append(HumanMessage(content=prompt))
        
        try:
            response = await self.llm.ainvoke(messages)
            
            if response_format == "json":
                import json
                return json.loads(response.content)
            
            return response.content
            
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise
    
    async def generate_summary(
        self,
        data: Any,
        max_length: int = 500
    ) -> str:
        """Generate summary of data or results"""
        
        prompt = f"""
        Please provide a concise summary of the following data/results.
        Focus on key insights and patterns.
        Maximum length: {max_length} words.
        
        Data: {data}
        """
        
        return await self.generate_response(prompt)