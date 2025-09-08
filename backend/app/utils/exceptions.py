from typing import Optional, Dict, Any

class BaseAppException(Exception):
    """Base exception for application"""
    
    def __init__(self, message: str, code: str = None, details: Dict[str, Any] = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}

class DatabaseException(BaseAppException):
    """Database related exceptions"""
    pass

class AnalysisException(BaseAppException):
    """Analysis related exceptions"""
    pass

class ValidationException(BaseAppException):
    """Validation related exceptions"""
    pass

class AgentException(BaseAppException):
    """Agent related exceptions"""
    pass

class AzureException(BaseAppException):
    """Azure service related exceptions"""
    pass

class ReportGenerationException(BaseAppException):
    """Report generation exceptions"""
    pass

def handle_exception(error: Exception) -> Dict[str, Any]:
    """Convert exception to response format"""
    
    if isinstance(error, BaseAppException):
        return {
            "error": True,
            "message": error.message,
            "code": error.code,
            "details": error.details
        }
    
    return {
        "error": True,
        "message": str(error),
        "code": "UNKNOWN_ERROR",
        "details": {}
    }
