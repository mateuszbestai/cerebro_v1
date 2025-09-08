from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
import logging
import traceback

from app.utils.exceptions import BaseAppException

logger = logging.getLogger(__name__)

async def error_handler_middleware(request: Request, call_next):
    """Global error handler middleware"""
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        return handle_error(e)

def handle_error(error: Exception) -> JSONResponse:
    """Handle different types of errors"""
    
    if isinstance(error, BaseAppException):
        logger.error(f"Application error: {error.message}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": True,
                "message": error.message,
                "code": error.code,
                "details": error.details
            }
        )
    
    elif isinstance(error, HTTPException):
        return JSONResponse(
            status_code=error.status_code,
            content={
                "error": True,
                "message": error.detail,
                "code": "HTTP_ERROR"
            }
        )
    
    elif isinstance(error, RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": True,
                "message": "Validation error",
                "details": error.errors()
            }
        )
    
    else:
        logger.error(f"Unexpected error: {str(error)}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": True,
                "message": "Internal server error",
                "code": "INTERNAL_ERROR"
            }
        )