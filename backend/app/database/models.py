from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean
from datetime import datetime

Base = declarative_base()

class ChatHistory(Base):
    """Store chat history"""
    __tablename__ = "chat_history"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String(100), index=True)
    user_message = Column(Text)
    ai_response = Column(Text)
    data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

class AnalysisResults(Base):
    """Store analysis results"""
    __tablename__ = "analysis_results"
    
    id = Column(String(100), primary_key=True)
    query = Column(Text)
    result_data = Column(JSON)
    visualization = Column(JSON)
    status = Column(String(50))
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Reports(Base):
    """Store generated reports"""
    __tablename__ = "reports"
    
    id = Column(String(100), primary_key=True)
    title = Column(String(255))
    description = Column(Text)
    content = Column(JSON)
    file_path = Column(String(500))
    format = Column(String(20))
    status = Column(String(50))
    created_by = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

class QueryCache(Base):
    """Cache for query results"""
    __tablename__ = "query_cache"
    
    id = Column(Integer, primary_key=True)
    query_hash = Column(String(255), unique=True, index=True)
    query_text = Column(Text)
    result = Column(JSON)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)