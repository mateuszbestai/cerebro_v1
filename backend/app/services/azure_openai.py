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
        
        # Default system prompt for clean responses
        self.default_system_prompt = """
        You are a professional data analyst assistant. Your responses should be:
        - Clear and conversational
        - Focused on insights and value
        - Free from technical jargon
        - Well-formatted with bullet points and lists where appropriate
        - Never mention the tools or processes you use internally
        """
    
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
        
        # Use provided system prompt or default to clean responses
        effective_system_prompt = system_prompt if system_prompt else self.default_system_prompt
        messages.append(SystemMessage(content=effective_system_prompt))
        
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
        
        return await self.generate_response(prompt)