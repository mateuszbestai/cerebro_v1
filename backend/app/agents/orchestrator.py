from typing import Dict, Any, Optional, List
from langchain.memory import ConversationBufferMemory
import logging

from app.services.azure_openai import AzureOpenAIService
from app.tools.visualization import VisualizationTool
from app.tools.report_tools import ReportGenerationTool
from app.api.routes.database import active_connections

logger = logging.getLogger(__name__)

class AgentOrchestrator:
    """Main orchestrator for coordinating different agents with database context"""
    
    def __init__(self):
        self.llm_service = AzureOpenAIService()
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
        Process user query with database context from frontend
        """
        try:
            # Check if we have a database connection from the frontend
            connection_id = context.get("database_connection_id") if context else None
            database_context = context.get("database_context") if context else None
            
            # Analyze query intent with database context
            intent = await self._analyze_intent(query, database_context)
            
            result = {
                "query": query,
                "intent": intent,
                "response": None,
                "data": None,
                "visualization": None,
                "report": None,
                "sql_query": None
            }
            
            if intent["type"] == "sql_query" and connection_id:
                # Use the connection from frontend
                result = await self._handle_sql_query(
                    query, 
                    connection_id, 
                    database_context,
                    intent
                )
                
            elif intent["type"] == "data_analysis" and connection_id:
                # Analyze data using the connected database
                result = await self._handle_data_analysis(
                    query,
                    connection_id,
                    database_context,
                    context.get("data") if context else None
                )
                
            elif intent["type"] == "report_generation":
                # Generate report with database context
                result = await self._handle_report_generation(
                    query,
                    connection_id,
                    context
                )
                
            else:
                # General query or no database connection
                response = await self._handle_general_query(query, database_context)
                result["response"] = response
            
            # Store in memory
            self.memory.save_context(
                {"input": query}, 
                {"output": result.get("response", "No response generated")}
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            return {
                "query": query,
                "intent": {"type": "error"},
                "response": f"I encountered an error processing your request: {str(e)}",
                "error": str(e),
                "data": None,
                "visualization": None,
                "report": None
            }
    
    async def _handle_sql_query(
        self, 
        query: str, 
        connection_id: str,
        database_context: str,
        intent: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle SQL queries using the frontend connection"""
        
        # Check if connection exists
        if connection_id not in active_connections:
            return {
                "query": query,
                "intent": intent,
                "response": "The database connection is no longer active. Please reconnect.",
                "error": "Connection not found"
            }
        
        try:
            # Generate SQL query using LLM with database context
            sql_query = await self._generate_sql_query(query, database_context)
            
            # Execute the query
            from app.api.routes.database import execute_query
            query_result = await execute_query(connection_id, sql_query)
            
            if query_result["success"]:
                # Generate explanation of results
                explanation = await self._explain_sql_results(
                    query, 
                    sql_query, 
                    query_result
                )
                
                result = {
                    "query": query,
                    "intent": intent,
                    "response": explanation,
                    "data": query_result.get("data"),
                    "sql_query": sql_query,
                    "columns": query_result.get("columns"),
                    "row_count": query_result.get("row_count")
                }
                
                # Generate visualization if needed
                if intent.get("needs_visualization") and query_result.get("data"):
                    try:
                        viz = await self.visualization_tool.create_chart(
                            query_result["data"],
                            intent.get("chart_type", "auto")
                        )
                        result["visualization"] = viz
                    except Exception as e:
                        logger.error(f"Error creating visualization: {str(e)}")
                
                return result
            else:
                return {
                    "query": query,
                    "intent": intent,
                    "response": f"Query failed: {query_result.get('error', 'Unknown error')}",
                    "error": query_result.get("error"),
                    "sql_query": sql_query
                }
                
        except Exception as e:
            logger.error(f"Error handling SQL query: {str(e)}")
            return {
                "query": query,
                "intent": intent,
                "response": f"Failed to execute SQL query: {str(e)}",
                "error": str(e)
            }
    
    async def _generate_sql_query(self, natural_language: str, database_context: str) -> str:
        """Generate SQL query from natural language using database context"""
        
        prompt = f"""
        Database Context:
        {database_context}
        
        User Query: {natural_language}
        
        Generate a SQL query to answer the user's question.
        
        Rules:
        1. Use only the tables mentioned in the database context
        2. Include appropriate JOINs if multiple tables are needed
        3. Add LIMIT 100 to prevent large result sets unless specifically asked for more
        4. Use proper SQL syntax for SQL Server
        5. Return ONLY the SQL query, no explanation
        
        SQL Query:
        """
        
        sql_query = await self.llm_service.generate_response(prompt)
        
        # Clean up the query
        sql_query = sql_query.strip()
        if sql_query.startswith("```sql"):
            sql_query = sql_query[6:]
        if sql_query.endswith("```"):
            sql_query = sql_query[:-3]
        
        return sql_query.strip()
    
    async def _explain_sql_results(
        self, 
        original_query: str,
        sql_query: str,
        query_result: Dict[str, Any]
    ) -> str:
        """Generate explanation of SQL query results"""
        
        # Prepare data summary
        data_summary = ""
        if query_result.get("data"):
            data = query_result["data"]
            data_summary = f"""
            Results: {len(data)} rows returned
            Columns: {', '.join(query_result.get('columns', []))}
            
            Sample data (first 5 rows):
            {data[:5] if len(data) > 5 else data}
            """
        elif query_result.get("rows_affected") is not None:
            data_summary = f"Query affected {query_result['rows_affected']} rows"
        
        prompt = f"""
        User asked: {original_query}
        
        SQL Query executed:
        {sql_query}
        
        {data_summary}
        
        Provide a clear, concise explanation of:
        1. What the query did
        2. Key findings from the results
        3. Any notable patterns or insights
        
        Keep the response conversational and helpful.
        """
        
        return await self.llm_service.generate_response(prompt)
    
    async def _handle_data_analysis(
        self,
        query: str,
        connection_id: str,
        database_context: str,
        existing_data: Optional[Any] = None
    ) -> Dict[str, Any]:
        """Handle data analysis requests"""
        
        # If we have existing data, analyze it
        if existing_data:
            analysis = await self._analyze_existing_data(query, existing_data)
            return {
                "query": query,
                "intent": {"type": "data_analysis"},
                "response": analysis,
                "data": existing_data
            }
        
        # Otherwise, fetch data from database first
        sql_query = await self._generate_sql_query(query, database_context)
        
        from app.api.routes.database import execute_query
        query_result = await execute_query(connection_id, sql_query)
        
        if query_result["success"] and query_result.get("data"):
            analysis = await self._analyze_existing_data(query, query_result["data"])
            
            return {
                "query": query,
                "intent": {"type": "data_analysis"},
                "response": analysis,
                "data": query_result["data"],
                "sql_query": sql_query
            }
        else:
            return {
                "query": query,
                "intent": {"type": "data_analysis"},
                "response": "Unable to fetch data for analysis",
                "error": query_result.get("error")
            }
    
    async def _analyze_existing_data(self, query: str, data: Any) -> str:
        """Analyze existing data"""
        
        import pandas as pd
        import json
        
        # Convert to DataFrame for analysis
        if isinstance(data, list) and len(data) > 0:
            df = pd.DataFrame(data)
            
            # Basic statistics
            stats = {
                "shape": df.shape,
                "columns": df.columns.tolist(),
                "dtypes": df.dtypes.to_dict(),
                "null_counts": df.isnull().sum().to_dict(),
                "summary": df.describe().to_dict() if len(df.select_dtypes(include=['number']).columns) > 0 else {}
            }
            
            prompt = f"""
            User query: {query}
            
            Data statistics:
            {json.dumps(stats, indent=2, default=str)}
            
            Sample data (first 10 rows):
            {df.head(10).to_dict('records')}
            
            Provide insights and analysis based on this data.
            Focus on:
            1. Key patterns and trends
            2. Notable statistics
            3. Any anomalies or interesting findings
            4. Recommendations based on the data
            """
            
            return await self.llm_service.generate_response(prompt)
        
        return "No data available for analysis"
    
    async def _handle_report_generation(
        self,
        query: str,
        connection_id: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Handle report generation requests"""
        
        try:
            report = await self.report_tool.generate_report(
                query,
                context.get("data") if context else None,
                context.get("analysis_results") if context else None
            )
            
            return {
                "query": query,
                "intent": {"type": "report_generation"},
                "response": "Report generated successfully",
                "report": report
            }
        except Exception as e:
            logger.error(f"Error generating report: {str(e)}")
            return {
                "query": query,
                "intent": {"type": "report_generation"},
                "response": f"Failed to generate report: {str(e)}",
                "error": str(e)
            }
    
    async def _handle_general_query(self, query: str, database_context: Optional[str]) -> str:
        """Handle general queries"""
        
        prompt = query
        if database_context:
            prompt = f"""
            Database Context (for reference):
            {database_context}
            
            User Query: {query}
            
            Please answer the user's question. If it relates to the database, 
            you can reference the available tables and suggest SQL queries they could run.
            """
        
        return await self.llm_service.generate_response(prompt)
    
    async def _analyze_intent(self, query: str, database_context: Optional[str] = None) -> Dict[str, Any]:
        """Analyze user query to determine intent and required tools"""
        
        try:
            context_info = ""
            if database_context:
                context_info = f"""
                Database is connected with the following context:
                {database_context}
                """
            
            prompt = f"""
            {context_info}
            
            Analyze the following query and determine:
            1. Type: sql_query, data_analysis, report_generation, or general
            2. If visualization is needed
            3. Suggested chart type if applicable
            
            Query: {query}
            
            Rules for classification:
            - sql_query: User wants to query the database or asks about specific data
            - data_analysis: User wants statistical analysis or insights from data
            - report_generation: User wants a formatted report or document
            - general: General questions or no database operation needed
            
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
        except Exception as e:
            logger.error(f"Error analyzing intent: {str(e)}")
            # Default to general type if intent analysis fails
            return {
                "type": "general",
                "needs_visualization": False,
                "chart_type": "auto"
            }