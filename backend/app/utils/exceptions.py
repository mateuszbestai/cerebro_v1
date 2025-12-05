from typing import Dict, Any

class BaseAppException(Exception):
    """Base exception for application"""

    def __init__(self, message: str, code: str = None, details: Dict[str, Any] = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}
