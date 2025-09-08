from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from langchain.schema.language_model import BaseLanguageModel
import logging

logger = logging.getLogger(__name__)

class BaseAgent(ABC):
    """Abstract base class for all agents"""
    
    def __init__(self, llm: BaseLanguageModel, name: str = "BaseAgent"):
        self.llm = llm
        self.name = name
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    @abstractmethod
    async def process(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process a query and return results"""
        pass
    
    def validate_input(self, query: str) -> bool:
        """Validate input query"""
        if not query or not query.strip():
            raise ValueError("Query cannot be empty")
        return True
    
    def format_response(self, success: bool, data: Any = None, error: str = None) -> Dict[str, Any]:
        """Format standardized response"""
        return {
            "success": success,
            "agent": self.name,
            "data": data,
            "error": error
        }