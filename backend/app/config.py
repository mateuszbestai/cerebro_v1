from pydantic_settings import BaseSettings
from typing import List
import os
import platform
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    """Application settings"""
    
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AI Analysis Agent"
    
    # Azure SQL Database
    AZURE_SQL_SERVER: str = os.getenv("AZURE_SQL_SERVER", "")
    AZURE_SQL_DATABASE: str = os.getenv("AZURE_SQL_DATABASE", "")
    AZURE_SQL_USERNAME: str = os.getenv("AZURE_SQL_USERNAME", "")
    AZURE_SQL_PASSWORD: str = os.getenv("AZURE_SQL_PASSWORD", "")
    
    # Azure OpenAI
    AZURE_OPENAI_API_KEY: str = os.getenv("AZURE_OPENAI_API_KEY", "")
    AZURE_OPENAI_ENDPOINT: str = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    AZURE_OPENAI_DEPLOYMENT_NAME: str = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://localhost",  # Add this for nginx proxy
    ]
    
    # Redis (for caching)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    @property
    def AZURE_SQL_CONNECTION_STRING(self) -> str:
        """Generate connection string based on platform and available drivers"""
        
        # Detect available ODBC driver
        driver = self._get_odbc_driver()
        
        # Build connection string with proper driver
        conn_str = (
            f"mssql+pyodbc://{self.AZURE_SQL_USERNAME}:{self.AZURE_SQL_PASSWORD}@"
            f"{self.AZURE_SQL_SERVER}/{self.AZURE_SQL_DATABASE}?"
            f"driver={driver}"
        )
        
        # Add additional parameters for better compatibility
        conn_str += "&TrustServerCertificate=yes"
        conn_str += "&Encrypt=yes"
        
        return conn_str
    
    def _get_odbc_driver(self) -> str:
        """Detect the best available ODBC driver for SQL Server"""
        
        # Check environment variable first
        env_driver = os.getenv("ODBC_DRIVER")
        if env_driver:
            return env_driver.replace(" ", "+")
        
        # Try to detect installed drivers
        possible_drivers = [
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server",
            "FreeTDS",
            "SQL Server Native Client 11.0",
            "SQL Server",
        ]
        
        # On Linux/Docker, check odbcinst.ini
        if os.path.exists("/etc/odbcinst.ini"):
            try:
                with open("/etc/odbcinst.ini", "r") as f:
                    content = f.read()
                    for driver in possible_drivers:
                        if f"[{driver}]" in content:
                            return driver.replace(" ", "+")
            except:
                pass
        
        # Platform-specific defaults
        system = platform.system()
        if system == "Linux":
            # In Docker/Linux, we use FreeTDS
            return "FreeTDS"
        elif system == "Darwin":  # macOS
            # On macOS, typically ODBC Driver 17 or 18
            return "ODBC+Driver+17+for+SQL+Server"
        elif system == "Windows":
            # On Windows, typically ODBC Driver 17 or 18
            return "ODBC+Driver+17+for+SQL+Server"
        else:
            # Default fallback
            return "FreeTDS"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()