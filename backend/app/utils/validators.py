import re
from typing import Any, Dict, List, Optional
from datetime import datetime

def validate_sql_query(query: str) -> bool:
    """Validate SQL query for safety"""
    
    # Check for dangerous keywords
    dangerous_keywords = [
        'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 
        'CREATE', 'REPLACE', 'GRANT', 'REVOKE'
    ]
    
    query_upper = query.upper()
    for keyword in dangerous_keywords:
        if keyword in query_upper:
            raise ValueError(f"Dangerous SQL keyword detected: {keyword}")
    
    return True

def validate_table_name(table_name: str) -> bool:
    """Validate table name format"""
    
    pattern = r'^[a-zA-Z_][a-zA-Z0-9_]*$'
    if not re.match(pattern, table_name):
        raise ValueError(f"Invalid table name: {table_name}")
    
    return True

def validate_date_format(date_str: str, format: str = "%Y-%m-%d") -> datetime:
    """Validate and parse date string"""
    
    try:
        return datetime.strptime(date_str, format)
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}. Expected format: {format}")

def validate_chart_type(chart_type: str) -> bool:
    """Validate chart type"""
    
    valid_types = ['bar', 'line', 'scatter', 'pie', 'heatmap', 'table', 'auto']
    if chart_type not in valid_types:
        raise ValueError(f"Invalid chart type: {chart_type}. Must be one of {valid_types}")
    
    return True

def validate_report_format(format: str) -> bool:
    """Validate report format"""
    
    valid_formats = ['pdf', 'html', 'markdown', 'docx']
    if format not in valid_formats:
        raise ValueError(f"Invalid report format: {format}. Must be one of {valid_formats}")
    
    return True

def sanitize_input(text: str) -> str:
    """Sanitize user input"""
    
    # Remove potential script tags
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Remove potential SQL injection attempts
    text = re.sub(r'(;|--|\/\*|\*\/)', '', text)
    
    # Escape special characters
    text = text.replace("'", "''")
    
    return text.strip()

def validate_pagination(page: int, page_size: int) -> tuple:
    """Validate pagination parameters"""
    
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 10
    if page_size > 100:
        page_size = 100
    
    offset = (page - 1) * page_size
    return offset, page_size