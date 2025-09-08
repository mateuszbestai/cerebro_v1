from typing import Dict, Any, Optional, List
from langchain.agents import create_sql_agent
from langchain.agents.agent_toolkits import SQLDatabaseToolkit
from langchain.sql_database import SQLDatabase
from langchain.agents.agent_types import AgentType
from langchain.callbacks import CallbackManagerForToolRun
import logging
import pandas as pd

from app.database.connection import DatabaseManager
from app.config import settings

logger = logging.getLogger(__name__)

class SQLAgent:
    """Agent for SQL database analysis"""
    
    def __init__(self, llm):
        self.llm = llm
        self.db = None
        self.agent = None
        self._initialize()
    
    def _initialize(self):
        """Initialize SQL database connection and agent"""
        try:
            # Create SQLDatabase instance for LangChain
            self.db = SQLDatabase.from_uri(
                settings.AZURE_SQL_CONNECTION_STRING,
                include_tables=None,  # Include all tables
                sample_rows_in_table_info=3
            )
            
            # Create SQL toolkit
            toolkit = SQLDatabaseToolkit(
                db=self.db,
                llm=self.llm
            )
            
            # Create SQL agent
            self.agent = create_sql_agent(
                llm=self.llm,
                toolkit=toolkit,
                verbose=True,
                agent_type=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
                handle_parsing_errors=True,
                max_iterations=5
            )
            
        except Exception as e:
            logger.error(f"Failed to initialize SQL Agent: {str(e)}")
            raise
    
    async def execute_query(self, natural_language_query: str) -> Dict[str, Any]:
        """
        Execute a natural language query against the database
        """
        try:
            # Add context to help the agent
            enhanced_query = f"""
            {natural_language_query}
            
            Please provide:
            1. The SQL query you're executing
            2. The results in a structured format
            3. A brief explanation of the results
            
            If the query returns numerical data, include basic statistics.
            """
            
            # Execute through agent
            response = await self.agent.ainvoke({"input": enhanced_query})
            
            # Parse response to extract SQL query and results
            result = self._parse_agent_response(response)
            
            return result
            
        except Exception as e:
            logger.error(f"Error executing SQL query: {str(e)}")
            return {
                "error": str(e),
                "data": None,
                "query": None,
                "explanation": f"Failed to execute query: {str(e)}"
            }
    
    def _parse_agent_response(self, response: Dict) -> Dict[str, Any]:
        """Parse agent response to extract structured data"""
        
        output = response.get("output", "")
        
        # Extract SQL query if mentioned
        sql_query = self._extract_sql_query(output)
        
        # Try to extract data table if present
        data = self._extract_data_table(output)
        
        return {
            "query": sql_query,
            "data": data,
            "explanation": output,
            "success": True
        }
    
    def _extract_sql_query(self, text: str) -> Optional[str]:
        """Extract SQL query from agent output"""
        import re
        
        # Look for SQL query patterns
        sql_pattern = r"```sql\n(.*?)\n```"
        match = re.search(sql_pattern, text, re.DOTALL | re.IGNORECASE)
        
        if match:
            return match.group(1).strip()
        
        # Alternative pattern
        if "SELECT" in text.upper():
            lines = text.split('\n')
            sql_lines = []
            in_query = False
            
            for line in lines:
                if 'SELECT' in line.upper():
                    in_query = True
                if in_query:
                    sql_lines.append(line)
                    if ';' in line:
                        break
            
            if sql_lines:
                return '\n'.join(sql_lines)
        
        return None
    
    def _extract_data_table(self, text: str) -> Optional[List[Dict]]:
        """Extract tabular data from agent output"""
        # This is a simplified extraction
        # In production, you'd want more robust parsing
        
        try:
            # Look for table patterns in the output
            lines = text.split('\n')
            data_lines = []
            in_table = False
            
            for line in lines:
                if '|' in line and not line.strip().startswith('```'):
                    in_table = True
                    data_lines.append(line)
                elif in_table and line.strip() == '':
                    break
            
            if data_lines and len(data_lines) > 2:
                # Parse table format
                headers = [h.strip() for h in data_lines[0].split('|') if h.strip()]
                
                data = []
                for line in data_lines[2:]:  # Skip header and separator
                    if '|' in line:
                        values = [v.strip() for v in line.split('|') if v.strip()]
                        if len(values) == len(headers):
                            data.append(dict(zip(headers, values)))
                
                return data if data else None
                
        except Exception as e:
            logger.error(f"Error extracting data table: {str(e)}")
        
        return None
    
    async def get_table_info(self) -> Dict[str, Any]:
        """Get information about available tables"""
        try:
            table_info = self.db.get_table_info()
            return {
                "tables": self.db.get_usable_table_names(),
                "schema": table_info
            }
        except Exception as e:
            logger.error(f"Error getting table info: {str(e)}")
            raise