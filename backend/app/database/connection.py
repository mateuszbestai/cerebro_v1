import asyncio
from typing import Optional, List, Dict, Any
import aioodbc
import pyodbc
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager
import logging

from app.config import settings

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manage database connections and operations"""
    
    _instance: Optional['DatabaseManager'] = None
    _engine: Optional[AsyncEngine] = None
    _session_factory: Optional[sessionmaker] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
        return cls._instance
    
    @classmethod
    async def initialize(cls):
        """Initialize database connection"""
        if cls._engine is None:
            try:
                # Create async engine
                cls._engine = create_async_engine(
                    settings.AZURE_SQL_CONNECTION_STRING.replace("mssql+pyodbc", "mssql+aioodbc"),
                    echo=False,
                    pool_pre_ping=True,
                    pool_size=10,
                    max_overflow=20
                )
                
                # Create session factory
                cls._session_factory = sessionmaker(
                    bind=cls._engine,
                    class_=AsyncSession,
                    expire_on_commit=False
                )
                
                logger.info("Database connection initialized successfully")
                
            except Exception as e:
                logger.error(f"Failed to initialize database: {str(e)}")
                raise
    
    @classmethod
    async def close(cls):
        """Close database connection"""
        if cls._engine:
            await cls._engine.dispose()
            cls._engine = None
            cls._session_factory = None
            logger.info("Database connection closed")
    
    @classmethod
    @asynccontextmanager
    async def get_session(cls):
        """Get database session"""
        if cls._session_factory is None:
            await cls.initialize()
        
        async with cls._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
    
    @classmethod
    async def execute_raw_query(cls, query: str, params: Optional[Dict] = None) -> List[Dict]:
        """Execute raw SQL query"""
        async with cls.get_session() as session:
            result = await session.execute(query, params or {})
            return [dict(row) for row in result]
    
    @classmethod
    async def get_tables(cls) -> List[str]:
        """Get list of tables in database"""
        query = """
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        """
        
        results = await cls.execute_raw_query(query)
        return [row['TABLE_NAME'] for row in results]
    
    @classmethod
    async def get_table_schema(cls, table_name: str) -> List[Dict[str, Any]]:
        """Get schema for a specific table"""
        query = """
        SELECT 
            COLUMN_NAME,
            DATA_TYPE,
            IS_NULLABLE,
            CHARACTER_MAXIMUM_LENGTH,
            NUMERIC_PRECISION,
            NUMERIC_SCALE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = :table_name
        ORDER BY ORDINAL_POSITION
        """
        
        return await cls.execute_raw_query(query, {"table_name": table_name})