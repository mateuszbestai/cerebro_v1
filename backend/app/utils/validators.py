import re

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
