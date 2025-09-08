from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket
from contextlib import asynccontextmanager
import logging

from app.api.routes import chat, analysis, reports
from app.config import settings
from app.database.connection import DatabaseManager
from app.utils.logger import setup_logger

# Setup logging
logger = setup_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    logger.info("Starting AI Analysis Agent...")
    
    # Initialize database connection pool
    await DatabaseManager.initialize()
    
    yield
    
    # Cleanup
    logger.info("Shutting down AI Analysis Agent...")
    await DatabaseManager.close()

# Create FastAPI app
app = FastAPI(
    title="AI Analysis Agent",
    description="AI-powered data analysis with Azure SQL and OpenAI",
    version="1.0.0",
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
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["analysis"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])

@app.get("/")
async def root():
    return {"message": "AI Analysis Agent API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}