from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.api.routes import chat, analysis, reports, database
from app.config import settings
from app.utils.logger import setup_logger

# Setup logging
logger = setup_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    logger.info("Starting AI Analysis Agent...")
    logger.info(f"Database configuration present: {settings.has_sql_config}")
    logger.info(f"OpenAI configuration present: {settings.has_openai_config}")
    
    # Note: Database connections are now managed per-request from frontend
    # No need to initialize database connection pool on startup
    
    yield
    
    # Cleanup
    logger.info("Shutting down AI Analysis Agent...")
    
    # Disconnect any active database connections
    from app.api.routes.database import active_connections
    for conn_id, conn_info in list(active_connections.items()):
        try:
            conn_info["engine"].dispose()
            logger.info(f"Closed database connection: {conn_id}")
        except Exception as e:
            logger.error(f"Error closing connection {conn_id}: {str(e)}")

# Create FastAPI app
app = FastAPI(
    title="AI Analysis Agent",
    description="AI-powered data analysis with Azure SQL and OpenAI",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(database.router, prefix="/api/v1/database", tags=["database"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["analysis"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])

@app.get("/")
async def root():
    return {
        "message": "AI Analysis Agent API",
        "version": "2.0.0",
        "features": {
            "database_management": "Frontend-controlled database connections",
            "chat": "AI-powered chat with database context",
            "analysis": "Data analysis and visualization",
            "reports": "Automated report generation"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    from app.api.routes.database import active_connections
    
    health_status = {
        "status": "healthy",
        "services": {
            "api": "operational",
            "database_connections": len(active_connections),
            "openai_configured": settings.has_openai_config
        }
    }
    
    # Check if core services are configured
    if not settings.has_openai_config:
        health_status["status"] = "degraded"
        health_status["services"]["openai_configured"] = False
    
    return health_status

@app.get("/api/v1/status")
async def api_status():
    """Detailed API status"""
    from app.api.routes.database import active_connections
    import pyodbc
    
    return {
        "database": {
            "active_connections": len(active_connections),
            "available_drivers": pyodbc.drivers()
        },
        "configuration": {
            "sql_config_present": settings.has_sql_config,
            "openai_config_present": settings.has_openai_config,
            "cors_origins": settings.ALLOWED_ORIGINS
        },
        "version": "2.0.0"
    }