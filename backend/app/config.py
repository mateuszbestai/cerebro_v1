from pydantic_settings import BaseSettings
from typing import List, Optional
import os
import platform
import subprocess
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    """Application settings with improved error handling"""
    
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AI Analysis Agent"
    
    # Azure SQL Database (with defaults to prevent crashes)
    AZURE_SQL_SERVER: str = os.getenv("AZURE_SQL_SERVER", "")
    AZURE_SQL_DATABASE: str = os.getenv("AZURE_SQL_DATABASE", "")
    AZURE_SQL_USERNAME: str = os.getenv("AZURE_SQL_USERNAME", "")
    AZURE_SQL_PASSWORD: str = os.getenv("AZURE_SQL_PASSWORD", "")
    
    # Azure OpenAI (with defaults)
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
    def AZURE_SQL_CONNECTION_STRING(self) -> Optional[str]:
        """Generate connection string based on platform and available drivers"""
        
        # Check if required SQL config is present
        if not all([self.AZURE_SQL_SERVER, self.AZURE_SQL_DATABASE, 
                   self.AZURE_SQL_USERNAME, self.AZURE_SQL_PASSWORD]):
            logger.warning("Azure SQL configuration is incomplete. SQL features will be disabled.")
            return None
        
        # Detect available ODBC driver
        driver = self._get_odbc_driver()
        
        if not driver:
            logger.error("No SQL Server ODBC driver found. SQL features will be disabled.")
            return None
        
        # Build connection string with proper driver
        conn_str = (
            f"mssql+pyodbc://{self.AZURE_SQL_USERNAME}:{self.AZURE_SQL_PASSWORD}@"
            f"{self.AZURE_SQL_SERVER}/{self.AZURE_SQL_DATABASE}?"
            f"driver={driver}"
        )
        
        # Add additional parameters for better compatibility
        conn_str += "&TrustServerCertificate=yes"
        conn_str += "&Encrypt=yes"
        conn_str += "&Connection+Timeout=30"  # Add timeout to prevent hanging
        
        return conn_str
    
    def _get_odbc_driver(self) -> Optional[str]:
        """Detect the best available ODBC driver for SQL Server"""
        
        # Check environment variable first
        env_driver = os.getenv("ODBC_DRIVER")
        if env_driver:
            logger.info(f"Using ODBC driver from environment: {env_driver}")
            return env_driver.replace(" ", "+")
        
        system = platform.system()
        
        # macOS specific detection
        if system == "Darwin":
            drivers = self._detect_macos_drivers()
            if drivers:
                driver = drivers[0]
                logger.info(f"Detected ODBC driver on macOS: {driver}")
                return driver.replace(" ", "+")
            else:
                logger.warning("No ODBC drivers found on macOS. Install with: brew install msodbcsql17")
                return None
        
        # Linux/Docker specific detection
        elif system == "Linux":
            if os.path.exists("/etc/odbcinst.ini"):
                drivers = self._parse_odbcinst_ini()
                if drivers:
                    driver = drivers[0]
                    logger.info(f"Detected ODBC driver on Linux: {driver}")
                    return driver.replace(" ", "+")
            
            # Default to FreeTDS in Docker
            if os.path.exists("/.dockerenv") or os.getenv("DOCKER_CONTAINER"):
                logger.info("Running in Docker, using FreeTDS")
                return "FreeTDS"
            
            return None
        
        # Windows specific detection
        elif system == "Windows":
            drivers = self._detect_windows_drivers()
            if drivers:
                driver = drivers[0]
                logger.info(f"Detected ODBC driver on Windows: {driver}")
                return driver.replace(" ", "+")
            return None
        
        logger.warning(f"Unknown platform: {system}")
        return None
    
    def _detect_macos_drivers(self) -> List[str]:
        """Detect ODBC drivers on macOS"""
        drivers = []
        
        # Check if odbcinst is available
        try:
            result = subprocess.run(['odbcinst', '-q', '-d'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                # Parse the output to get driver names
                for line in result.stdout.strip().split('\n'):
                    line = line.strip()
                    if line.startswith('[') and line.endswith(']'):
                        driver_name = line[1:-1]
                        if 'SQL Server' in driver_name or 'FreeTDS' in driver_name:
                            drivers.append(driver_name)
        except (subprocess.SubprocessError, FileNotFoundError):
            logger.debug("odbcinst command not available")
        
        # Check common installation paths
        common_drivers = [
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server",
            "FreeTDS"
        ]
        
        # Check if driver files exist
        for driver in common_drivers:
            if driver not in drivers:
                # Check common library paths on macOS
                lib_paths = [
                    f"/usr/local/lib/lib*odbc*.dylib",
                    f"/opt/homebrew/lib/lib*odbc*.dylib",
                    "/usr/local/opt/msodbcsql*/lib/*.dylib"
                ]
                
                for path_pattern in lib_paths:
                    import glob
                    if glob.glob(path_pattern):
                        if driver not in drivers:
                            drivers.append(driver)
                        break
        
        return drivers
    
    def _detect_windows_drivers(self) -> List[str]:
        """Detect ODBC drivers on Windows"""
        drivers = []
        
        try:
            import winreg
            
            # Check ODBC drivers in registry
            key_path = r"SOFTWARE\ODBC\ODBCINST.INI\ODBC Drivers"
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                i = 0
                while True:
                    try:
                        driver_name, _, _ = winreg.EnumValue(key, i)
                        if 'SQL Server' in driver_name:
                            drivers.append(driver_name)
                        i += 1
                    except WindowsError:
                        break
        except Exception:
            logger.debug("Could not read Windows registry for ODBC drivers")
        
        # Add common defaults if nothing found
        if not drivers:
            drivers = [
                "ODBC Driver 18 for SQL Server",
                "ODBC Driver 17 for SQL Server",
                "SQL Server"
            ]
        
        return drivers
    
    def _parse_odbcinst_ini(self) -> List[str]:
        """Parse /etc/odbcinst.ini to find available drivers"""
        drivers = []
        
        try:
            with open("/etc/odbcinst.ini", "r") as f:
                content = f.read()
                import re
                # Find all driver sections
                pattern = r'\[([^\]]+)\]'
                matches = re.findall(pattern, content)
                for match in matches:
                    if 'SQL Server' in match or 'FreeTDS' in match:
                        drivers.append(match)
        except Exception as e:
            logger.debug(f"Could not parse odbcinst.ini: {e}")
        
        return drivers
    
    @property
    def has_sql_config(self) -> bool:
        """Check if SQL configuration is available"""
        return bool(self.AZURE_SQL_CONNECTION_STRING)
    
    @property
    def has_openai_config(self) -> bool:
        """Check if OpenAI configuration is available"""
        return bool(self.AZURE_OPENAI_API_KEY and self.AZURE_OPENAI_ENDPOINT)
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Log configuration status on startup
if not settings.has_sql_config:
    logger.warning("SQL Database configuration is missing or incomplete")
if not settings.has_openai_config:
    logger.warning("Azure OpenAI configuration is missing or incomplete")