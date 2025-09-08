import plotly.graph_objects as go
import plotly.express as px
from typing import Dict, Any, List, Optional
import pandas as pd
import json
import logging

logger = logging.getLogger(__name__)

class VisualizationTool:
    """Tool for creating data visualizations"""
    
    def __init__(self):
        self.default_layout = {
            "template": "plotly_white",
            "font": {"family": "Arial, sans-serif"},
            "showlegend": True,
            "hovermode": "closest",
            "margin": {"l": 60, "r": 30, "t": 50, "b": 60}
        }
    
    async def create_chart(
        self,
        data: Any,
        chart_type: str = "auto",
        config: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Create a Plotly chart from data
        """
        try:
            # Convert data to DataFrame
            df = self._prepare_dataframe(data)
            
            # Auto-detect chart type if needed
            if chart_type == "auto":
                chart_type = self._detect_chart_type(df)
            
            # Create chart based on type
            fig = self._create_chart_by_type(df, chart_type, config)
            
            # Convert to JSON for frontend
            chart_json = fig.to_json()
            
            return {
                "type": chart_type,
                "data": chart_json,
                "config": {
                    "responsive": True,
                    "displayModeBar": True,
                    "displaylogo": False
                }
            }
            
        except Exception as e:
            logger.error(f"Error creating chart: {str(e)}")
            raise
    
    def _prepare_dataframe(self, data: Any) -> pd.DataFrame:
        """Convert data to DataFrame for visualization"""
        
        if isinstance(data, pd.DataFrame):
            return data
        elif isinstance(data, list) and all(isinstance(item, dict) for item in data):
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            return pd.DataFrame(data)
        else:
            raise ValueError(f"Unsupported data type for visualization: {type(data)}")
    
    def _detect_chart_type(self, df: pd.DataFrame) -> str:
        """Auto-detect appropriate chart type based on data"""
        
        numeric_cols = df.select_dtypes(include=['number']).columns
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns
        
        if len(df) == 0:
            return "table"
        elif len(numeric_cols) >= 2:
            # Multiple numeric columns - scatter or line
            return "scatter" if len(df) < 50 else "line"
        elif len(numeric_cols) == 1 and len(categorical_cols) >= 1:
            # One numeric, one categorical - bar chart
            return "bar"
        elif len(categorical_cols) >= 1 and df[categorical_cols[0]].nunique() < 10:
            # Categorical with few unique values - pie chart
            return "pie"
        else:
            return "table"
    
    def _create_chart_by_type(
        self,
        df: pd.DataFrame,
        chart_type: str,
        config: Optional[Dict]
    ) -> go.Figure:
        """Create specific chart type"""
        
        if chart_type == "bar":
            return self._create_bar_chart(df, config)
        elif chart_type == "line":
            return self._create_line_chart(df, config)
        elif chart_type == "scatter":
            return self._create_scatter_chart(df, config)
        elif chart_type == "pie":
            return self._create_pie_chart(df, config)
        elif chart_type == "heatmap":
            return self._create_heatmap(df, config)
        else:
            return self._create_table(df, config)
    
    def _create_bar_chart(self, df: pd.DataFrame, config: Optional[Dict]) -> go.Figure:
        """Create bar chart"""
        
        numeric_cols = df.select_dtypes(include=['number']).columns
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns
        
        if len(categorical_cols) > 0 and len(numeric_cols) > 0:
            x_col = categorical_cols[0]
            y_col = numeric_cols[0]
            
            fig = px.bar(
                df,
                x=x_col,
                y=y_col,
                title=f"{y_col} by {x_col}"
            )
        else:
            fig = px.bar(df)
        
        fig.update_layout(**self.default_layout)
        return fig
    
    def _create_line_chart(self, df: pd.DataFrame, config: Optional[Dict]) -> go.Figure:
        """Create line chart"""
        
        numeric_cols = df.select_dtypes(include=['number']).columns
        
        if len(numeric_cols) >= 2:
            fig = px.line(
                df,
                x=df.index if df.index.name else numeric_cols[0],
                y=numeric_cols[1] if len(numeric_cols) > 1 else numeric_cols[0],
                title="Line Chart"
            )
        else:
            fig = px.line(df)
        
        fig.update_layout(**self.default_layout)
        return fig
    
    def _create_scatter_chart(self, df: pd.DataFrame, config: Optional[Dict]) -> go.Figure:
        """Create scatter chart"""
        
        numeric_cols = df.select_dtypes(include=['number']).columns
        
        if len(numeric_cols) >= 2:
            fig = px.scatter(
                df,
                x=numeric_cols[0],
                y=numeric_cols[1],
                title=f"{numeric_cols[1]} vs {numeric_cols[0]}"
            )
        else:
            fig = px.scatter(df)
        
        fig.update_layout(**self.default_layout)
        return fig
    
    def _create_pie_chart(self, df: pd.DataFrame, config: Optional[Dict]) -> go.Figure:
        """Create pie chart"""
        
        categorical_cols = df.select_dtypes(include=['object', 'category']).columns
        numeric_cols = df.select_dtypes(include=['number']).columns
        
        if len(categorical_cols) > 0 and len(numeric_cols) > 0:
            fig = px.pie(
                df,
                names=categorical_cols[0],
                values=numeric_cols[0],
                title=f"Distribution of {numeric_cols[0]}"
            )
        else:
            fig = px.pie(df)
        
        fig.update_layout(**self.default_layout)
        return fig
    
    def _create_heatmap(self, df: pd.DataFrame, config: Optional[Dict]) -> go.Figure:
        """Create heatmap"""
        
        numeric_df = df.select_dtypes(include=['number'])
        
        if not numeric_df.empty:
            fig = px.imshow(
                numeric_df.corr(),
                title="Correlation Heatmap",
                color_continuous_scale="RdBu"
            )
        else:
            fig = go.Figure()
        
        fig.update_layout(**self.default_layout)
        return fig
    
    def _create_table(self, df: pd.DataFrame, config: Optional[Dict]) -> go.Figure:
        """Create table visualization"""
        
        fig = go.Figure(data=[go.Table(
            header=dict(
                values=list(df.columns),
                fill_color='paleturquoise',
                align='left'
            ),
            cells=dict(
                values=[df[col].tolist() for col in df.columns],
                fill_color='lavender',
                align='left'
            )
        )])
        
        fig.update_layout(
            title="Data Table",
            **self.default_layout
        )
        return fig