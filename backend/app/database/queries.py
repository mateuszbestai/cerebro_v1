ANALYSIS_QUERIES = {
    "top_n": """
        SELECT TOP {n} {columns}
        FROM {table}
        {where_clause}
        ORDER BY {order_column} {order_direction}
    """,
    
    "aggregation": """
        SELECT 
            {group_columns},
            {aggregate_functions}
        FROM {table}
        {where_clause}
        GROUP BY {group_columns}
        {having_clause}
        ORDER BY {order_column} {order_direction}
    """,
    
    "time_series": """
        SELECT 
            CONVERT(DATE, {date_column}) as date,
            {aggregate_functions}
        FROM {table}
        WHERE {date_column} BETWEEN :start_date AND :end_date
        GROUP BY CONVERT(DATE, {date_column})
        ORDER BY date
    """,
    
    "join": """
        SELECT {columns}
        FROM {table1} t1
        {join_type} JOIN {table2} t2 ON {join_condition}
        {where_clause}
        ORDER BY {order_column}
    """
}

def build_query(template_name: str, **kwargs) -> str:
    """Build query from template"""
    template = ANALYSIS_QUERIES.get(template_name)
    if not template:
        raise ValueError(f"Unknown query template: {template_name}")
    
    # Add default values for optional clauses
    kwargs.setdefault('where_clause', '')
    kwargs.setdefault('having_clause', '')
    kwargs.setdefault('order_direction', 'DESC')
    
    # Format where clause if conditions provided
    if 'conditions' in kwargs and kwargs['conditions']:
        kwargs['where_clause'] = 'WHERE ' + ' AND '.join(kwargs['conditions'])
    
    return template.format(**kwargs)