from typing import Dict, Any, Optional, List
from langchain.agents import AgentExecutor
from langchain.memory import ConversationBufferMemory
from langchain.schema import BaseMessage
import logging

from app.agents.sql_agent import SQLAgent
from app.agents.pandas_agent import PandasAgent
from app.services.azure_openai import AzureOpenAIService
from app.tools.visualization import VisualizationTool
from app.tools.report_tools import ReportGenerationTool

logger = logging.getLogger(__name__)

class AgentOrchestrator:
    """Main orchestrator for coordinating different agents"""
    
    def __init__(self):
        self.llm_service = AzureOpenAIService()
        self.sql_agent = SQLAgent(self.llm_service.get_llm())
        self.pandas_agent = PandasAgent(self.llm_service.get_llm())
        self.visualization_tool = VisualizationTool()
        self.report_tool = ReportGenerationTool()
        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
    
    async def process_query(
        self, 
        query: str, 
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process user query and determine which agent/tool to use
        """
        try:
            # Analyze query intent
            intent = await self._analyze_intent(query)
            
            result = {
                "query": query,
                "intent": intent,
                "response": None,
                "data": None,
                "visualization": None,
                "report": None
            }
            
            if intent["type"] == "sql_query":
                # Use SQL agent for database queries
                sql_result = await self.sql_agent.execute_query(query)
                result["data"] = sql_result["data"]
                result["response"] = sql_result["explanation"]
                
                # Generate visualization if applicable
                if sql_result["data"] and intent.get("needs_visualization"):
                    viz = await self.visualization_tool.create_chart(
                        sql_result["data"],
                        intent.get("chart_type", "auto")
                    )
                    result["visualization"] = viz
            
            elif intent["type"] == "data_analysis":
                # Use Pandas agent for complex analysis
                pandas_result = await self.pandas_agent.analyze_data(
                    query, 
                    context.get("data")
                )
                result["data"] = pandas_result["data"]
                result["response"] = pandas_result["analysis"]
                
            elif intent["type"] == "report_generation":
                # Generate comprehensive report
                report = await self.report_tool.generate_report(
                    query,
                    context.get("data"),
                    context.get("analysis_results")
                )
                result["report"] = report
                result["response"] = "Report generated successfully"
            
            elif intent["type"] == "general":
                # Use base LLM for general queries
                response = await self.llm_service.generate_response(query)
                result["response"] = response
            
            # Store in memory
            self.memory.save_context(
                {"input": query}, 
                {"output": result["response"]}
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            raise
    
    async def _analyze_intent(self, query: str) -> Dict[str, Any]:
        """Analyze user query to determine intent and required tools"""
        
        prompt = f"""
        Analyze the following query and determine:
        1. Type: sql_query, data_analysis, report_generation, or general
        2. If visualization is needed
        3. Suggested chart type if applicable
        
        Query: {query}
        
        Return as JSON:
        {{
            "type": "...",
            "needs_visualization": true/false,
            "chart_type": "bar/line/scatter/pie/auto"
        }}
        """
        
        response = await self.llm_service.generate_response(
            prompt, 
            response_format="json"
        )
        
        return response