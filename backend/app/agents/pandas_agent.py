from typing import Dict, Any, Optional, List
import pandas as pd
from langchain_experimental.agents import create_pandas_dataframe_agent
from langchain.agents.agent_types import AgentType
import logging
import io
import json

logger = logging.getLogger(__name__)

class PandasAgent:
    """Agent for pandas DataFrame analysis"""
    
    def __init__(self, llm):
        self.llm = llm
        self.current_df = None
    
    async def analyze_data(
        self, 
        query: str, 
        data: Optional[Any] = None,
        df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Any]:
        """
        Analyze data using pandas operations
        """
        try:
            # Convert data to DataFrame if needed
            if df is not None:
                self.current_df = df
            elif data is not None:
                self.current_df = self._convert_to_dataframe(data)
            elif self.current_df is None:
                return {
                    "error": "No data provided for analysis",
                    "data": None,
                    "analysis": None
                }
            
            # Create pandas agent
            agent = create_pandas_dataframe_agent(
                self.llm,
                self.current_df,
                verbose=True,
                agent_type=AgentType.OPENAI_FUNCTIONS,
                handle_parsing_errors=True
            )
            
            # Enhanced query with specific instructions
            enhanced_query = f"""
            {query}
            
            Analyze the data and provide:
            1. Direct answer to the question
            2. Key insights and findings
            3. Relevant statistics (formatted clearly)
            4. Patterns or trends discovered
            5. Recommendations based on the analysis
            
            Important guidelines:
            - Be conversational and clear
            - Format numbers with appropriate precision (e.g., 1,234.56 or 12.3%)
            - Focus on insights, not technical details
            - Don't describe the pandas operations or code used
            - Present findings as natural language insights
            - Use bullet points or numbered lists for clarity when appropriate
            """
            
            # Execute analysis
            response = await agent.ainvoke({"input": enhanced_query})
            
            # Parse response
            result = self._parse_analysis_response(response)
            
            return result
            
        except Exception as e:
            logger.error(f"Error in pandas analysis: {str(e)}")
            return {
                "error": str(e),
                "data": None,
                "analysis": f"Analysis failed: {str(e)}"
            }
    
    def _convert_to_dataframe(self, data: Any) -> pd.DataFrame:
        """Convert various data formats to pandas DataFrame"""
        
        if isinstance(data, pd.DataFrame):
            return data
        elif isinstance(data, dict):
            return pd.DataFrame(data)
        elif isinstance(data, list):
            if all(isinstance(item, dict) for item in data):
                return pd.DataFrame(data)
            else:
                return pd.DataFrame(data)
        elif isinstance(data, str):
            # Try to parse as CSV
            try:
                return pd.read_csv(io.StringIO(data))
            except:
                # Try to parse as JSON
                try:
                    return pd.DataFrame(json.loads(data))
                except:
                    raise ValueError("Unable to convert data to DataFrame")
        else:
            raise ValueError(f"Unsupported data type: {type(data)}")
    
    def _parse_analysis_response(self, response: Dict) -> Dict[str, Any]:
        """Parse pandas agent response"""
        
        output = response.get("output", "")
        
        # Extract any dataframe representations
        data_output = self._extract_dataframe_output(output)
        
        # Extract statistical information
        stats = self._extract_statistics(output)
        
        return {
            "analysis": output,
            "data": data_output,
            "statistics": stats,
            "success": True
        }
    
    def _extract_dataframe_output(self, text: str) -> Optional[Dict]:
        """Extract DataFrame output from text"""
        try:
            # Look for common DataFrame string representations
            if "DataFrame" in text or "|" in text:
                # This is simplified - you'd want more robust parsing
                lines = text.split('\n')
                for i, line in enumerate(lines):
                    if '|' in line and i > 0:
                        # Potential table found
                        # Parse it (simplified version)
                        return {"table_found": True, "raw": line}
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting DataFrame output: {str(e)}")
            return None
    
    def _extract_statistics(self, text: str) -> Dict[str, Any]:
        """Extract statistical information from text"""
        stats = {}
        
        # Look for common statistical terms
        import re
        
        patterns = {
            "mean": r"mean[:\s]+([0-9.]+)",
            "median": r"median[:\s]+([0-9.]+)",
            "std": r"std(?:dev)?[:\s]+([0-9.]+)",
            "count": r"count[:\s]+([0-9]+)",
            "min": r"min[:\s]+([0-9.]+)",
            "max": r"max[:\s]+([0-9.]+)"
        }
        
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    stats[key] = float(match.group(1))
                except:
                    stats[key] = match.group(1)
        
        return stats if stats else None