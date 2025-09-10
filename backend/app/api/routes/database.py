from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List
import logging
import pyodbc
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
import hashlib
import json
from datetime import datetime

from app.utils.logger import setup_logger

router = APIRouter()
logger = setup_logger(__name__)

# Store active connections (in production, use Redis or a database)
active_connections: Dict[str, Any] = {}

class ConnectionRequest(BaseModel):
    """Database connection request model"""
    server: str = Field(..., description="SQL Server hostname or IP")
    database: str = Field(..., description="Database name")
    username: str = Field(..., description="Username")
    password: str = Field(..., description="Password")
    port: int = Field(default=1433, description="SQL Server port")
    driver: Optional[str] = Field(default=None, description="ODBC driver name")
    encrypt: bool = Field(default=True, description="Use encryption")
    trust_server_certificate: bool = Field(default=True, description="Trust server certificate")
    connection_timeout: int = Field(default=30, description="Connection timeout in seconds")
    
    @validator('server')
    def validate_server(cls, v):
        if not v or not v.strip():
            raise ValueError("Server cannot be empty")
        return v.strip()
    
    @validator('database')
    def validate_database(cls, v):
        if not v or not v.strip():
            raise ValueError("Database cannot be empty")
        return v.strip()

class ConnectionResponse(BaseModel):
    """Connection response model"""
    connection_id: str
    status: str
    message: str
    server_info: Optional[Dict[str, Any]] = None
    available_drivers: Optional[List[str]] = None

class TableInfo(BaseModel):
    """Table information model"""
    name: str
    schema: str
    row_count: Optional[int] = None
    columns: List[Dict[str, Any]]
    indexes: Optional[List[Dict[str, Any]]] = None
    sample_data: Optional[List[Dict[str, Any]]] = None

class DatabaseInfo(BaseModel):
    """Database information model"""
    database_name: str
    server_version: str
    tables_count: int
    total_size_mb: Optional[float] = None
    collation: Optional[str] = None

@router.get("/drivers")
async def get_available_drivers():
    """Get list of available ODBC drivers on the system"""
    try:
        drivers = pyodbc.drivers()
        
        # Filter for SQL Server related drivers
        sql_drivers = [d for d in drivers if 'SQL' in d.upper() or 'FREETDS' in d.upper()]
        
        # Detect the best driver
        recommended_driver = None
        for driver in sql_drivers:
            if 'ODBC Driver 18' in driver:
                recommended_driver = driver
                break
            elif 'ODBC Driver 17' in driver:
                recommended_driver = driver
                break
        
        if not recommended_driver and sql_drivers:
            recommended_driver = sql_drivers[0]
        
        return {
            "all_drivers": drivers,
            "sql_drivers": sql_drivers,
            "recommended": recommended_driver,
            "message": "Available ODBC drivers detected"
        }
    except Exception as e:
        logger.error(f"Error getting drivers: {str(e)}")
        return {
            "all_drivers": [],
            "sql_drivers": [],
            "recommended": None,
            "message": f"Error detecting drivers: {str(e)}"
        }

@router.post("/connect", response_model=ConnectionResponse)
async def connect_to_database(request: ConnectionRequest):
    """Establish a new database connection"""
    try:
        # Auto-detect driver if not specified
        if not request.driver:
            drivers_info = await get_available_drivers()
            request.driver = drivers_info.get("recommended")
            
            if not request.driver:
                raise ValueError("No SQL Server ODBC driver found. Please install ODBC Driver 17 or 18 for SQL Server")
        
        # Build connection string
        conn_str = build_connection_string(request)
        
        # Test connection (with timeout) and prepare engine for reuse
        engine = create_engine(
            conn_str,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            connect_args={"timeout": 10}
        )
        
        # Test with a simple query - avoid @@VERSION which can cause issues
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT 
                    DB_NAME() as db_name,
                    CONVERT(NVARCHAR(128), SERVERPROPERTY('ProductVersion')) as version,
                    CONVERT(NVARCHAR(128), SERVERPROPERTY('Edition')) as edition
            """))
            server_info = dict(result.fetchone()._mapping)
        
        # Generate connection ID
        connection_id = generate_connection_id(request)
        
        # Store connection details (excluding password)
        active_connections[connection_id] = {
            "engine": engine,
            "server": request.server,
            "database": request.database,
            "username": request.username,
            "driver": request.driver,
            "connected_at": datetime.utcnow().isoformat()
        }
        
        return ConnectionResponse(
            connection_id=connection_id,
            status="connected",
            message=f"Successfully connected to {request.database} on {request.server}",
            server_info=server_info
        )
        
    except SQLAlchemyError as e:
        logger.error(f"Database connection error: {str(e)}")
        
        # Parse error for better user feedback
        error_message = parse_sql_error(str(e))
        
        # Get available drivers for troubleshooting
        drivers_info = await get_available_drivers()
        
        return ConnectionResponse(
            connection_id="",
            status="error",
            message=error_message,
            available_drivers=drivers_info.get("sql_drivers", [])
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/test-connection")
async def test_connection(request: ConnectionRequest):
    """Test database connection without storing it"""
    try:
        # Auto-detect driver if not specified
        if not request.driver:
            drivers_info = await get_available_drivers()
            request.driver = drivers_info.get("recommended")
            
            if not request.driver:
                return {
                    "success": False,
                    "message": "No SQL Server ODBC driver found",
                    "details": drivers_info
                }
        
        conn_str = build_connection_string(request)
        engine = create_engine(conn_str, connect_args={"timeout": 10})
        
        # Test connection
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1 as test"))
            result.fetchone()
        
        engine.dispose()
        
        return {
            "success": True,
            "message": "Connection successful",
            "server": request.server,
            "database": request.database
        }
        
    except Exception as e:
        error_message = parse_sql_error(str(e))
        return {
            "success": False,
            "message": error_message,
            "error_type": type(e).__name__
        }

@router.get("/connections")
async def get_active_connections():
    """Get list of active connections"""
    connections = []
    for conn_id, conn_info in active_connections.items():
        # Don't include the engine object in response
        info = {k: v for k, v in conn_info.items() if k != "engine"}
        info["connection_id"] = conn_id
        connections.append(info)
    
    return {
        "connections": connections,
        "count": len(connections)
    }

@router.delete("/disconnect/{connection_id}")
async def disconnect_database(connection_id: str):
    """Disconnect from database"""
    if connection_id not in active_connections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    try:
        # Dispose of the engine
        engine = active_connections[connection_id]["engine"]
        engine.dispose()
        
        # Remove from active connections
        del active_connections[connection_id]
        
        return {
            "status": "disconnected",
            "message": "Successfully disconnected from database"
        }
    except Exception as e:
        logger.error(f"Error disconnecting: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/database-info/{connection_id}")
async def get_database_info(connection_id: str) -> DatabaseInfo:
    """Get database information and statistics"""
    if connection_id not in active_connections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    try:
        engine = active_connections[connection_id]["engine"]
        
        with engine.connect() as conn:
            # Get database info - avoid @@VERSION which can return XML type
            # Get database name
            db_name_query = text("SELECT DB_NAME() as database_name")
            db_name = conn.execute(db_name_query).scalar()
            
            # Get server version in a safer way
            version_query = text("""
                SELECT 
                    CONVERT(NVARCHAR(128), SERVERPROPERTY('ProductVersion')) as version,
                    CONVERT(NVARCHAR(128), SERVERPROPERTY('ProductLevel')) as level,
                    CONVERT(NVARCHAR(128), SERVERPROPERTY('Edition')) as edition
            """)
            version_info = dict(conn.execute(version_query).fetchone()._mapping)
            server_version = f"Microsoft SQL Server {version_info['version']} {version_info['level']} {version_info['edition']}"
            
            # Get collation (cast from sql_variant to NVARCHAR)
            collation_query = text("SELECT CONVERT(NVARCHAR(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) as collation")
            collation = conn.execute(collation_query).scalar()
            
            # Get table count
            count_query = text("""
                SELECT COUNT(*) as table_count 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE'
            """)
            table_count = conn.execute(count_query).scalar()
            
            # Get database size (use sys.database_files which is available in Azure SQL and on-prem)
            try:
                size_query = text("""
                    SELECT 
                        SUM(CAST(size AS BIGINT)) * 8.0 / 1024 AS size_mb
                    FROM sys.database_files
                """)
                size_mb = conn.execute(size_query).scalar()
            except Exception:
                # Fallback to data file size only (file_id = 1) if aggregate fails
                try:
                    size_query = text("""
                        SELECT CAST(size AS BIGINT) * 8.0 / 1024 AS size_mb
                        FROM sys.database_files
                        WHERE file_id = 1
                    """)
                    size_mb = conn.execute(size_query).scalar()
                except Exception:
                    size_mb = None
        
        return DatabaseInfo(
            database_name=db_name,
            server_version=server_version,
            tables_count=table_count,
            total_size_mb=float(size_mb) if size_mb else None,
            collation=collation
        )
        
    except Exception as e:
        logger.error(f"Error getting database info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/tables/{connection_id}")
async def get_tables(connection_id: str, include_system: bool = False):
    """Get list of tables in the database"""
    if connection_id not in active_connections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    try:
        engine = active_connections[connection_id]["engine"]
        inspector = inspect(engine)
        
        # Get all tables
        tables = []
        for table_name in inspector.get_table_names():
            # Skip system tables if requested
            if not include_system and table_name.startswith('sys'):
                continue
            
            # Get basic table info
            columns = inspector.get_columns(table_name)
            
            # Get row count (be careful with large tables)
            with engine.connect() as conn:
                count_query = text(f"SELECT COUNT(*) FROM [{table_name}]")
                try:
                    row_count = conn.execute(count_query).scalar()
                except:
                    row_count = None
            
            tables.append({
                "name": table_name,
                "columns_count": len(columns),
                "row_count": row_count,
                "type": "table"
            })
        
        # Sort by name
        tables.sort(key=lambda x: x["name"])
        
        return {
            "tables": tables,
            "count": len(tables)
        }
        
    except Exception as e:
        logger.error(f"Error getting tables: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/table/{connection_id}/{table_name}")
async def get_table_details(
    connection_id: str, 
    table_name: str,
    include_sample: bool = True,
    sample_size: int = 10
) -> TableInfo:
    """Get detailed information about a specific table"""
    if connection_id not in active_connections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )
    
    try:
        engine = active_connections[connection_id]["engine"]
        inspector = inspect(engine)
        
        # Get columns
        columns = []
        for col in inspector.get_columns(table_name):
            columns.append({
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col["nullable"],
                "default": col["default"],
                "autoincrement": col.get("autoincrement", False)
            })
        
        # Get primary keys
        pk = inspector.get_pk_constraint(table_name)
        
        # Get indexes
        indexes = inspector.get_indexes(table_name)
        
        # Get foreign keys
        fks = inspector.get_foreign_keys(table_name)
        
        # Get row count and sample data
        with engine.connect() as conn:
            # Row count
            count_query = text(f"SELECT COUNT(*) FROM [{table_name}]")
            row_count = conn.execute(count_query).scalar()
            
            # Sample data
            sample_data = []
            if include_sample and row_count > 0:
                sample_query = text(f"SELECT TOP {sample_size} * FROM [{table_name}]")
                result = conn.execute(sample_query)
                for row in result:
                    sample_data.append(dict(row._mapping))
        
        # Get schema
        schema = "dbo"  # Default schema, you can make this dynamic
        
        return TableInfo(
            name=table_name,
            schema=schema,
            row_count=row_count,
            columns=columns,
            indexes=indexes,
            sample_data=sample_data if include_sample else None
        )
        
    except Exception as e:
        logger.error(f"Error getting table details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

class QueryRequest(BaseModel):
    """SQL query request model"""
    query: str
    limit: int = 100

async def execute_query_internal(connection_id: str, query: str, limit: int = 100):
    """Core query executor used by both API route and internal calls"""
    if connection_id not in active_connections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found"
        )

    try:
        engine = active_connections[connection_id]["engine"]
        # Normalize and apply TOP limit for SELECT without explicit TOP/LIMIT
        q = query.strip()
        if q.upper().startswith("SELECT") and " LIMIT " not in q.upper() and " TOP " not in q.upper():
            q = q.replace("SELECT", f"SELECT TOP {limit}", 1)

        with engine.connect() as conn:
            result = conn.execute(text(q))

            if result.returns_rows:
                rows = result.fetchall()
                columns = list(result.keys())
                data = [dict(row._mapping) for row in rows]
                return {
                    "success": True,
                    "columns": columns,
                    "data": data,
                    "row_count": len(data),
                    "query": q,
                }
            else:
                return {
                    "success": True,
                    "message": "Query executed successfully",
                    "rows_affected": result.rowcount,
                    "query": q,
                }
    except Exception as e:
        logger.error(f"Error executing query: {str(e)}")
        return {"success": False, "error": str(e), "query": query}

@router.post("/execute-query/{connection_id}")
async def execute_query(connection_id: str, request: QueryRequest):
    """API route wrapper that delegates to internal executor"""
    return await execute_query_internal(connection_id, request.query, request.limit)

def build_connection_string(request: ConnectionRequest) -> str:
    """Build SQL Server connection string
    Use explicit ODBC connection string via odbc_connect to ensure FreeTDS compatibility
    (Server/Port params and TDS_Version) across architectures.
    """
    import urllib.parse

    driver = request.driver
    # Build a DSN-less ODBC connection string
    parts = [
        f"Driver={{{driver}}}",
        f"Server={request.server}",  # hostname only; Port specified separately
        f"Port={request.port}",
        f"Database={request.database}",
        f"UID={request.username}",
        f"PWD={request.password}",
        "TDS_Version=7.4",
        "ClientCharset=UTF-8",
        f"Connection Timeout={request.connection_timeout}",
    ]

    if request.encrypt:
        parts.append("Encrypt=Yes")
    if request.trust_server_certificate:
        parts.append("TrustServerCertificate=Yes")

    odbc_str = ";".join(parts)
    encoded = urllib.parse.quote_plus(odbc_str)
    # Use SQLAlchemy/pyodbc URI with odbc_connect
    conn_str = f"mssql+pyodbc:///?odbc_connect={encoded}"
    return conn_str

def generate_connection_id(request: ConnectionRequest) -> str:
    """Generate unique connection ID"""
    # Create hash from connection details
    conn_str = f"{request.server}:{request.port}/{request.database}/{request.username}"
    return hashlib.md5(conn_str.encode()).hexdigest()[:12]

def parse_sql_error(error_str: str) -> str:
    """Parse SQL error message for better user feedback"""
    
    if "Login timeout expired" in error_str:
        return "Connection timeout - Check if the server address is correct and accessible"
    elif "Login failed" in error_str:
        return "Authentication failed - Check username and password"
    elif "Cannot open database" in error_str:
        return "Database not found - Check if the database name is correct"
    elif "ODBC Driver" in error_str and "not found" in error_str:
        return "ODBC driver not found - Please install SQL Server ODBC driver"
    elif "server was not found" in error_str:
        return "Server not found - Check server address and network connection"
    elif "SSL" in error_str or "certificate" in error_str.lower():
        return "SSL/Certificate error - Try enabling 'Trust Server Certificate' option"
    else:
        # Return original error but cleaned up
        return error_str.split('\n')[0]  # First line only