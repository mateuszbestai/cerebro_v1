import logging
import json
from datetime import datetime
import sys

from app.config import settings

class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }

        if hasattr(record, 'extra_data'):
            log_data.update(record.extra_data)

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)

def setup_logger(name: str = None) -> logging.Logger:
    """Setup logger with appropriate configuration"""

    logger = logging.getLogger(name or __name__)

    if not logger.handlers:
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(getattr(logging, settings.LOG_LEVEL))

        # Format based on environment
        if settings.LOG_LEVEL == "DEBUG":
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
        else:
            formatter = JSONFormatter()

        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        logger.setLevel(getattr(logging, settings.LOG_LEVEL))

        # Prevent propagation to avoid duplicate logs
        logger.propagate = False

    return logger
