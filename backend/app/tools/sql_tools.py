from typing import Dict, Any, Optional, List
import sqlparse
from sqlparse.sql import IdentifierList, Identifier
from sqlparse.tokens import Keyword, DML
import logging

from app.database.connection import DatabaseManager
from app.utils.validators import validate_sql_query

logger = logging.getLogger(__name__)

class SQLQueryTool:
    """Tool for executing SQL queries"""
    
    def __init__(self):
        self.db_manager = DatabaseManager()
    
    async def run(self, query: str) -> Dict[str, Any]:
        """Execute SQL query and return results"""
        
        try:
            # Validate query
            validate_sql_query(query)
            
            # Parse and optimize query
            optimized_query = self._optimize_query(query)
            
            # Execute query
            results = await self.db_manager.execute_raw_query(optimized_query)
            
            return {
                "success": True,
                "data": results,
                "row_count": len(results),
                "query": optimized_query
            }
            
        except Exception as e:
            logger.error(f"Error executing SQL query: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "query": query
            }
    
    def _optimize_query(self, query: str) -> str:
        """Optimize SQL query"""
        
        # Format query
        formatted = sqlparse.format(
            query,
            reindent=True,
            keyword_case='upper',
            strip_comments=True
        )
        
        # Add LIMIT if not present for SELECT queries
        parsed = sqlparse.parse(formatted)[0]
        if parsed.get_type() == 'SELECT' and 'LIMIT' not in formatted.upper():
            formatted += '\nLIMIT 1000'  # Default limit for safety
        
        return formatted

class SQLValidatorTool:
    """Tool for validating SQL queries"""
    
    def run(self, query: str) -> Dict[str, Any]:
        """Validate SQL query syntax"""
        
        try:
            # Basic syntax validation
            parsed = sqlparse.parse(query)
            
            if not parsed:
                return {
                    "valid": False,
                    "error": "Empty or invalid query"
                }
            
            # Check for dangerous operations
            validate_sql_query(query)
            
            # Extract query components
            statement = parsed[0]
            query_type = statement.get_type()
            
            # Extract tables
            tables = self._extract_tables(statement)
            
            # Extract columns
            columns = self._extract_columns(statement)
            
            return {
                "valid": True,
                "query_type": query_type,
                "tables": tables,
                "columns": columns,
                "formatted_query": sqlparse.format(query, reindent=True)
            }
            
        except Exception as e:
            return {
                "valid": False,
                "error": str(e)
            }
    
    def _extract_tables(self, parsed_query) -> List[str]:
        """Extract table names from query"""
        
        tables = []
        from_seen = False
        
        for token in parsed_query.tokens:
            if from_seen:
                if isinstance(token, IdentifierList):
                    for identifier in token.get_identifiers():
                        tables.append(str(identifier.get_name()))
                elif isinstance(token, Identifier):
                    tables.append(str(token.get_name()))
            elif token.ttype is Keyword and token.value.upper() == 'FROM':
                from_seen = True
        
        return tables
    
    def _extract_columns(self, parsed_query) -> List[str]:
        """Extract column names from query"""
        
        columns = []
        select_seen = False
        
        for token in parsed_query.tokens:
            if select_seen:
                if isinstance(token, IdentifierList):
                    for identifier in token.get_identifiers():
                        columns.append(str(identifier))
                elif isinstance(token, Identifier):
                    columns.append(str(token))
                elif token.ttype is Keyword:
                    break
            elif token.ttype is DML and token.value.upper() == 'SELECT':
                select_seen = True
        
        return columns