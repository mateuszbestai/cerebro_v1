from typing import Any, Dict, Optional
from langchain.chains.summarize import load_summarize_chain
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
import logging

logger = logging.getLogger(__name__)

class SummaryTool:
    """Tool for generating summaries"""
    
    def __init__(self, llm):
        self.llm = llm
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100
        )
    
    async def run(self, text: str, summary_type: str = "concise") -> str:
        """Generate summary of text"""
        
        try:
            if summary_type == "concise":
                return await self._generate_concise_summary(text)
            elif summary_type == "detailed":
                return await self._generate_detailed_summary(text)
            elif summary_type == "bullet":
                return await self._generate_bullet_summary(text)
            else:
                return await self._generate_concise_summary(text)
                
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            return f"Error generating summary: {str(e)}"
    
    async def _generate_concise_summary(self, text: str) -> str:
        """Generate a concise summary"""
        
        if len(text) < 500:
            return text  # Already concise
        
        prompt = f"""
        Provide a concise summary of the following text in 2-3 sentences:
        
        {text}
        
        Summary:
        """
        
        from app.services.azure_openai import AzureOpenAIService
        llm_service = AzureOpenAIService()
        return await llm_service.generate_response(prompt)
    
    async def _generate_detailed_summary(self, text: str) -> str:
        """Generate a detailed summary using map-reduce"""
        
        # Split text into chunks
        docs = [Document(page_content=chunk) for chunk in self.text_splitter.split_text(text)]
        
        # Use map-reduce chain for long documents
        chain = load_summarize_chain(
            self.llm,
            chain_type="map_reduce",
            verbose=False
        )
        
        result = await chain.arun(docs)
        return result
    
    async def _generate_bullet_summary(self, text: str) -> str:
        """Generate bullet point summary"""
        
        prompt = f"""
        Summarize the following text as bullet points.
        Include only the most important points:
        
        {text}
        
        Bullet Summary:
        """
        
        from app.services.azure_openai import AzureOpenAIService
        llm_service = AzureOpenAIService()
        return await llm_service.generate_response(prompt)
    
    async def summarize_data_analysis(
        self,
        data: Any,
        analysis_type: str
    ) -> str:
        """Generate summary specifically for data analysis results"""
        
        prompt = f"""
        Summarize the following {analysis_type} analysis results:
        
        Data: {str(data)[:1000]}  # Truncate if too long
        
        Focus on:
        1. Key findings
        2. Notable patterns
        3. Business implications
        
        Summary:
        """
        
        from app.services.azure_openai import AzureOpenAIService
        llm_service = AzureOpenAIService()
        return await llm_service.generate_response(prompt)