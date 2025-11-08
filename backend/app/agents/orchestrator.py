from typing import Dict, Any, Optional, List
from langchain.memory import ConversationBufferMemory
import logging

from app.services.azure_openai import AzureOpenAIService
from app.tools.visualization import VisualizationTool
from app.tools.report_tools import ReportGenerationTool
from app.api.routes.database import active_connections
from app.agents.pandas_agent import PandasAgent

logger = logging.getLogger(__name__)

class AgentOrchestrator:
    """Main orchestrator for coordinating different agents with database context"""
    
    def __init__(self):
        self.llm_service = AzureOpenAIService()
        self.visualization_tool = VisualizationTool()
        self.report_tool = ReportGenerationTool()
        # Cache pandas agents per model to respect user selections
        self.pandas_agents: Dict[str, PandasAgent] = {}
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
            context = dict(context or {})
            
            # Check if we have a database connection from the frontend
            connection_id = context.get("database_connection_id")
            database_context = context.get("database_context")
            selected_tables = context.get("selected_tables")
            forced_analysis_type = (
                context.get("analysis_type").lower()
                if isinstance(context.get("analysis_type"), str)
                else None
            )
            force_visualization = bool(context.get("visualization_required"))
            preferred_model = context.get("model")
            model_id = self.llm_service.resolve_model_id(preferred_model)
            if not model_id:
                raise ValueError("No Azure OpenAI model configured")
            
            # Analyze query intent with database context or honor explicit override
            intent_override = (
                self._build_forced_intent(forced_analysis_type)
                if forced_analysis_type
                else None
            )
            if intent_override:
                intent = intent_override
            else:
                intent = await self._analyze_intent(query, database_context, model_id=model_id)

            if force_visualization:
                intent["needs_visualization"] = True

            result = {
                "query": query,
                "intent": intent,
                "response": None,
                "data": None,
                "visualization": None,
                "report": None,
                "sql_query": None,
                "model": model_id
            }
            
            if intent["type"] == "sql_query" and connection_id:
                # Use the connection from frontend
                result = await self._handle_sql_query(
                    query, 
                    connection_id, 
                    database_context,
                    intent,
                    selected_tables,
                    model_id
                )
                
            elif intent["type"] == "data_analysis" and (connection_id or (context and context.get("data"))):
                # Analyze data using the connected database or provided dataset
                result = await self._handle_data_analysis(
                    query,
                    connection_id,
                    database_context,
                    context.get("data") if context else None,
                    intent,
                    selected_tables,
                    model_id
                )
                
            elif intent["type"] == "report_generation":
                # Generate report with database context
                result = await self._handle_report_generation(
                    query,
                    connection_id,
                    context,
                    model_id
                )
                
            else:
                # General query or no database connection
                response = await self._handle_general_query(query, database_context, model_id=model_id)
                result["response"] = response
                result["model"] = model_id
            
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

    def _build_forced_intent(self, analysis_type: Optional[str]) -> Optional[Dict[str, Any]]:
        """Map explicit analysis_type hints to orchestrator intent structures."""
        if not analysis_type:
            return None
        normalized = analysis_type.lower()
        mapping = {
            "sql": "sql_query",
            "sql_query": "sql_query",
            "database": "sql_query",
            "analysis": "data_analysis",
            "data_analysis": "data_analysis",
            "pandas": "data_analysis",
            "report": "report_generation",
            "report_generation": "report_generation",
            "general": "general",
            "chat": "general",
        }
        intent_type = mapping.get(normalized)
        if not intent_type:
            return None
        if intent_type == "general":
            return {"type": "general"}
        return {"type": intent_type}
    
    async def _handle_sql_query(
        self, 
        query: str, 
        connection_id: str,
        database_context: str,
        intent: Dict[str, Any],
        selected_tables: Optional[List[str]] = None,
        model_id: Optional[str] = None
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
            # Generate SQL query using LLM with database context and optional schema
            sql_query = await self._generate_sql_query(
                query,
                database_context,
                connection_id=connection_id,
                selected_tables=selected_tables,
                model_id=model_id
            )
            
            # Execute the query
            from app.api.routes.database import execute_query_internal
            query_result = await execute_query_internal(connection_id, sql_query)

            # If column name errors occur, retry once with schema details
            if not query_result.get("success") and "Invalid column name" in (query_result.get("error") or ""):
                sql_query = await self._generate_sql_query(
                    query,
                    database_context,
                    connection_id=connection_id,
                    selected_tables=selected_tables,
                    model_id=model_id
                )
                query_result = await execute_query_internal(connection_id, sql_query)
            
            if query_result["success"]:
                # Generate explanation of results
                explanation = await self._explain_sql_results(
                    query, 
                    sql_query, 
                    query_result,
                    model_id=model_id
                )
                
                result = {
                    "query": query,
                    "intent": intent,
                    "response": explanation,
                    "data": query_result.get("data"),
                    "sql_query": sql_query,
                    "columns": query_result.get("columns"),
                    "row_count": query_result.get("row_count"),
                    "model": model_id
                }
                
                # Generate visualization if needed
                if intent.get("needs_visualization") and query_result.get("data"):
                    try:
                        # Check if AI determined multiple charts are needed
                        if intent.get("multiple_charts", False):
                            charts = await self.visualization_tool.create_multiple_charts(
                                query_result["data"],
                                analysis_type="comprehensive"
                            )
                            result["visualizations"] = charts
                        else:
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
                    "sql_query": sql_query,
                    "model": model_id
                }
                
        except Exception as e:
            logger.error(f"Error handling SQL query: {str(e)}")
            return {
                "query": query,
                "intent": intent,
                "response": f"Failed to execute SQL query: {str(e)}",
                "error": str(e),
                "model": model_id
            }
    
    async def _generate_sql_query(
        self,
        natural_language: str,
        database_context: str,
        connection_id: Optional[str] = None,
        selected_tables: Optional[List[str]] = None,
        model_id: Optional[str] = None
    ) -> str:
        """Generate SQL query from natural language using database context"""
        
        # Optionally include concrete schema details for selected tables
        schema_context = ""
        if connection_id and selected_tables:
            try:
                schema_context = await self._build_schema_context(connection_id, selected_tables)
            except Exception as e:
                logger.debug(f"Schema context build failed: {e}")

        # Build schema section separately to avoid f-string backslash issues
        schema_section = f"Schema Details for Selected Tables:\n{schema_context}" if schema_context else ""

        prompt = f"""
        Database Context:
        {database_context}
        
        {schema_section}
        
        User Query: {natural_language}
        
        Generate an optimized SQL query to answer the user's question.
        Use only the columns that exist in the schema details above (if provided).
        Prefer the selected tables if they are relevant.
        
        Technical Requirements:
        1. Use only the tables mentioned in the database context or the selected tables provided
        2. Include appropriate JOINs if multiple tables are needed
        3. If needed, limit rows to 100 using SQL Server syntax (TOP 100 in the final SELECT)
        4. Always use COUNT(*) when counting rows
        5. Use proper SQL Server syntax (TOP, OFFSET/FETCH, ISNULL, CONVERT, etc.)
        6. Return ONLY the SQL query, no explanation
        
        SQL Query:
        """
        
        sql_query = await self.llm_service.generate_response(prompt, model_id=model_id)
        
        # Clean up and sanitize the query for SQL Server
        sql_query = sql_query.strip()
        if sql_query.startswith("```sql"):
            sql_query = sql_query[6:]
        if sql_query.endswith("```"):
            sql_query = sql_query[:-3]
        
        sql_query = self._sanitize_sql_for_sqlserver(sql_query.strip())
        return sql_query
    
    async def _build_schema_context(self, connection_id: str, tables: List[str]) -> str:
        """Build a compact schema description for the given tables."""
        try:
            from app.api.routes.database import get_table_details
            lines: List[str] = []
            for t in tables[:5]:  # cap at 5 tables to keep prompt small
                try:
                    info = await get_table_details(connection_id, t, include_sample=False)
                    col_names = [c["name"] for c in info.columns]
                    lines.append(f"- {t}: columns = {', '.join(col_names[:40])}{' ...' if len(col_names) > 40 else ''}")
                except Exception as e:
                    logger.debug(f"schema fetch failed for {t}: {e}")
            return "\n".join(lines)
        except Exception as e:
            logger.debug(f"schema context error: {e}")
            return ""

    def _sanitize_sql_for_sqlserver(self, sql: str) -> str:
        """Make small, safe fixes to LLM SQL for SQL Server.
        - Replace COUNT() with COUNT(*)
        - Convert trailing "LIMIT n" into "TOP n" in the final SELECT
        """
        import re
        s = sql
        # Fix COUNT()
        s = re.sub(r"\bCOUNT\(\s*\)\b", "COUNT(*)", s, flags=re.IGNORECASE)
        
        # Convert trailing LIMIT n to TOP n in final SELECT
        m = re.search(r"LIMIT\s+(\d+)\s*;?\s*$", s, flags=re.IGNORECASE)
        if m:
            n = m.group(1)
            # remove the LIMIT clause at the end
            s = s[:m.start()].rstrip()
            # find the last SELECT or SELECT DISTINCT
            matches = list(re.finditer(r"\bSELECT\s+(?:DISTINCT\s+)?", s, flags=re.IGNORECASE))
            if matches:
                last = matches[-1]
                insertion = last.group(0) + f"TOP {n} "
                s = s[:last.start()] + insertion + s[last.end():]
            else:
                # if we can't find SELECT, just append FETCH NEXT syntax as fallback
                s = s + f" OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY"
        return s

    async def _explain_sql_results(
        self, 
        original_query: str,
        sql_query: str,
        query_result: Dict[str, Any],
        model_id: Optional[str] = None
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
        
        Query Results:
        {data_summary}
        
        Provide a natural, conversational response that:
        1. Directly answers the user's question
        2. Highlights the most important findings
        3. Presents key statistics or metrics clearly
        4. Identifies patterns, trends, or anomalies
        5. Offers actionable insights or recommendations when relevant
        
        Guidelines:
        - Be friendly and conversational
        - Format numbers for easy reading (e.g., 1,234 instead of 1234)
        - Use percentages and comparisons where helpful
        - Organize information with bullet points or lists when appropriate
        - Don't mention SQL, queries, or technical database operations
        - Focus on the business insights and value
        - If the data shows concerning patterns, highlight them constructively
        """
        
        return await self.llm_service.generate_response(prompt, model_id=model_id)
    
    async def _handle_data_analysis(
        self,
        query: str,
        connection_id: Optional[str],
        database_context: str,
        existing_data: Optional[Any] = None,
        intent: Optional[Dict[str, Any]] = None,
        selected_tables: Optional[List[str]] = None,
        model_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle data analysis requests using the PandasAgent when possible"""
        
        try:
            # If we have existing data, analyze it directly
            data_for_analysis = existing_data
            sql_query = None
            if data_for_analysis is None:
                # If no dataset was provided, we need a connection to fetch data
                if not connection_id:
                    return {
                        "query": query,
                        "intent": {"type": "data_analysis"},
                        "response": "No dataset provided and no database connection available to fetch data.",
                        "error": "Missing data source",
                        "model": model_id
                    }
                # Fetch data from database first
                sql_query = await self._generate_sql_query(
                    query,
                    database_context,
                    connection_id=connection_id,
                    selected_tables=selected_tables,
                    model_id=model_id
                )
                from app.api.routes.database import execute_query_internal
                query_result = await execute_query_internal(connection_id, sql_query)
                if not (query_result.get("success") and query_result.get("data")):
                    return {
                        "query": query,
                        "intent": {"type": "data_analysis"},
                        "response": "Unable to fetch data for analysis",
                        "error": query_result.get("error"),
                        "model": model_id
                    }
                data_for_analysis = query_result["data"]
            
            pandas_agent = self._get_pandas_agent(model_id)
            
            # Run pandas agent analysis
            pandas_result = await pandas_agent.analyze_data(
                query,
                data=data_for_analysis
            )
            
            result: Dict[str, Any] = {
                "query": query,
                "intent": {"type": "data_analysis"} if intent is None else intent,
                "response": pandas_result.get("analysis"),
                "data": data_for_analysis,
                "model": model_id
            }
            if sql_query:
                result["sql_query"] = sql_query
            if pandas_result.get("statistics") is not None:
                result["statistics"] = pandas_result.get("statistics")
            
            # Optionally generate visualization
            if (intent or {}).get("needs_visualization") and data_for_analysis:
                try:
                    # Check if AI determined multiple charts are needed
                    if (intent or {}).get("multiple_charts", False):
                        charts = await self.visualization_tool.create_multiple_charts(
                            data_for_analysis,
                            analysis_type="comprehensive"
                        )
                        result["visualizations"] = charts
                    else:
                        viz = await self.visualization_tool.create_chart(
                            data_for_analysis,
                            (intent or {}).get("chart_type", "auto")
                        )
                        result["visualization"] = viz
                except Exception as viz_err:
                    logger.error(f"Error creating visualization for analysis: {viz_err}")
            
            return result
        except Exception as e:
            logger.error(f"Error handling data analysis: {str(e)}")
            return {
                "query": query,
                "intent": {"type": "data_analysis"},
                "response": f"Analysis failed: {str(e)}",
                "error": str(e),
                "model": model_id
            }
    
    async def _analyze_existing_data(self, query: str, data: Any, model_id: Optional[str] = None) -> str:
        """Analyze existing data (fallback path if pandas agent unavailable)"""
        
        import pandas as pd
        import json
        
        # Convert to DataFrame for analysis
        if isinstance(data, list) and len(data) > 0:
            df = pd.DataFrame(data)
            
            # Basic statistics
            stats = {
                "shape": df.shape,
                "columns": df.columns.tolist(),
                "dtypes": {k: str(v) for k, v in df.dtypes.to_dict().items()},
                "null_counts": df.isnull().sum().to_dict(),
                "summary": df.describe().to_dict() if len(df.select_dtypes(include=['number']).columns) > 0 else {}
            }
            
            prompt = f"""
            User query: {query}
            
            Dataset Overview:
            {json.dumps(stats, indent=2, default=str)}
            
            Sample data (first 10 rows):
            {df.head(10).to_dict('records')}
            
            Analyze this data and provide a comprehensive response that:
            1. Directly answers the user's question
            2. Highlights key patterns and trends
            3. Presents important statistics clearly
            4. Identifies any anomalies or outliers
            5. Offers actionable recommendations
            
            Format your response conversationally, using:
            - Clear headings for different insights
            - Bullet points for lists
            - Percentages and comparisons where helpful
            - Plain language, avoiding technical jargon
            """
            
            return await self.llm_service.generate_response(prompt, model_id=model_id)
        
        return "No data available for analysis"

    def _get_pandas_agent(self, model_id: Optional[str]) -> PandasAgent:
        """Return cached pandas agent for the requested model."""
        resolved_model = self.llm_service.resolve_model_id(model_id)
        if not resolved_model:
            raise ValueError("No Azure OpenAI model configured for pandas analysis")
        if resolved_model not in self.pandas_agents:
            self.pandas_agents[resolved_model] = PandasAgent(
                self.llm_service.get_llm(resolved_model, require_chat=True)
            )
        return self.pandas_agents[resolved_model]
    
    async def _handle_report_generation(
        self,
        query: str,
        connection_id: Optional[str],
        context: Optional[Dict[str, Any]],
        model_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle report generation requests"""
        
        try:
            report = await self.report_tool.generate_report(
                query,
                context.get("data") if context else None,
                context.get("analysis_results") if context else None,
                model_id=model_id
            )
            
            return {
                "query": query,
                "intent": {"type": "report_generation"},
                "response": "Report generated successfully",
                "report": report,
                "model": model_id
            }
        except Exception as e:
            logger.error(f"Error generating report: {str(e)}")
            return {
                "query": query,
                "intent": {"type": "report_generation"},
                "response": f"Failed to generate report: {str(e)}",
                "error": str(e),
                "model": model_id
            }
    
    async def _handle_general_query(self, query: str, database_context: Optional[str], model_id: Optional[str] = None) -> str:
        """Handle general queries"""
        
        prompt = query
        if database_context:
            prompt = f"""
            Available Database Information:
            {database_context}
            
            User Question: {query}
            
            Provide a helpful, conversational response. If the question relates to the database:
            - Explain what data is available
            - Suggest insights that could be obtained
            - Offer to help with specific analysis
            
            Be friendly, clear, and focus on helping the user understand their options.
            """
        
        return await self.llm_service.generate_response(prompt, model_id=model_id)
    
    async def _analyze_intent(self, query: str, database_context: Optional[str] = None, model_id: Optional[str] = None) -> Dict[str, Any]:
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
            
            Classify the user's request so we can respond appropriately.
            Determine:
            1. type: one of [sql_query, data_analysis, report_generation, general]
            2. needs_visualization: whether a chart would help communicate the result
            3. chart_type: if visualization is needed, suggest one of [bar, line, scatter, pie, heatmap, auto]
            4. multiple_charts: whether the query would benefit from multiple different visualizations to show various aspects of the data
            
            Query: {query}
            
            Classification rules:
            - sql_query: The user wants specific data from the database
            - data_analysis: The user wants insights, statistics, or trends from a dataset
            - report_generation: The user wants a formatted document or multi-section summary
            - general: Everything else that does not require database operations
            
            For multiple_charts, set to true if:
            - The user asks for comprehensive analysis or multiple perspectives
            - The query suggests exploring relationships, distributions, and trends together
            - The data would benefit from showing different chart types (e.g., both distribution and correlation)
            - The user wants to understand the data from multiple angles
            
            Return a compact JSON object with exactly these keys and booleans as true/false.
            """
            
            response = await self.llm_service.generate_response(
                prompt, 
                response_format="json",
                model_id=model_id
            )
            
            return response
        except Exception as e:
            logger.error(f"Error analyzing intent: {str(e)}")
            # Default to general type if intent analysis fails
            return {
                "type": "general",
                "needs_visualization": False,
                "chart_type": "auto",
                "multiple_charts": False
            }
