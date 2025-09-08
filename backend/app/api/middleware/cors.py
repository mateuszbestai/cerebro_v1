from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from app.config import settings

def setup_cors(app: FastAPI):
    """Setup CORS middleware"""
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600
    )