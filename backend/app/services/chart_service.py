import plotly.graph_objects as go
import plotly.express as px
from typing import Dict, Any, List, Optional, Union
import pandas as pd
import json
import base64
from io import BytesIO
import logging

logger = logging.getLogger(__name__)

class ChartService:
    """Service for advanced chart generation and manipulation"""
    
    def __init__(self):
        self.theme_colors = [
            '#0078D4', '#40E0D0', '#FF6B6B', '#4ECDC4', 
            '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'
        ]
    
    async def create_interactive_chart(
        self,
        data: pd.DataFrame,
        chart_type: str,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create interactive Plotly chart"""
        
        config = config or {}
        
        try:
            if chart_type == "bar":
                fig = self._create_bar_chart(data, config)
            elif chart_type == "line":
                fig = self._create_line_chart(data, config)
            elif chart_type == "scatter":
                fig = self._create_scatter_chart(data, config)
            elif chart_type == "pie":
                fig = self._create_pie_chart(data, config)
            elif chart_type == "heatmap":
                fig = self._create_heatmap(data, config)
            elif chart_type == "box":
                fig = self._create_box_plot(data, config)
            elif chart_type == "histogram":
                fig = self._create_histogram(data, config)
            elif chart_type == "sunburst":
                fig = self._create_sunburst(data, config)
            elif chart_type == "treemap":
                fig = self._create_treemap(data, config)
            elif chart_type == "waterfall":
                fig = self._create_waterfall(data, config)
            else:
                fig = self._create_table(data, config)
            
            # Apply theme
            fig.update_layout(
                template="plotly_white",
                font=dict(family="Segoe UI, sans-serif"),
                colorway=self.theme_colors,
                hovermode='closest',
                showlegend=True
            )
            
            return {
                "type": chart_type,
                "data": fig.to_json(),
                "config": {
                    "responsive": True,
                    "displayModeBar": True,
                    "toImageButtonOptions": {
                        "format": "png",
                        "filename": f"chart_{chart_type}",
                        "height": 500,
                        "width": 700,
                        "scale": 1
                    }
                }
            }
            
        except Exception as e:
            logger.error(f"Error creating chart: {str(e)}")
            raise
    
    def _create_bar_chart(self, df: pd.DataFrame, config: Dict) -> go.Figure:
        """Create enhanced bar chart"""
        
        x_col = config.get('x', df.columns[0])
        y_col = config.get('y', df.columns[1] if len(df.columns) > 1 else df.columns[0])
        
        fig = px.bar(
            df, 
            x=x_col, 
            y=y_col,
            title=config.get('title', f'{y_col} by {x_col}'),
            labels=config.get('labels', {}),
            color=config.get('color', None),
            barmode=config.get('barmode', 'relative'),
            text_auto=True
        )
        
        # Add value labels on bars
        fig.update_traces(texttemplate='%{text}', textposition='outside')
        
        return fig
    
    def _create_line_chart(self, df: pd.DataFrame, config: Dict) -> go.Figure:
        """Create line chart with trend line option"""
        
        x_col = config.get('x', df.columns[0])
        y_cols = config.get('y', [df.columns[1]] if len(df.columns) > 1 else [df.columns[0]])
        
        if not isinstance(y_cols, list):
            y_cols = [y_cols]
        
        fig = go.Figure()
        
        for y_col in y_cols:
            fig.add_trace(go.Scatter(
                x=df[x_col],
                y=df[y_col],
                mode='lines+markers',
                name=y_col,
                line=dict(width=2),
                marker=dict(size=6)
            ))
        
        # Add trend line if requested
        if config.get('trendline', False):
            import numpy as np
            from scipy import stats
            
            x_numeric = pd.to_numeric(df[x_col], errors='coerce')
            for y_col in y_cols:
                y_numeric = pd.to_numeric(df[y_col], errors='coerce')
                slope, intercept, _, _, _ = stats.linregress(x_numeric, y_numeric)
                trend_line = slope * x_numeric + intercept
                
                fig.add_trace(go.Scatter(
                    x=df[x_col],
                    y=trend_line,
                    mode='lines',
                    name=f'{y_col} (trend)',
                    line=dict(dash='dash', width=1)
                ))
        
        fig.update_layout(
            title=config.get('title', 'Line Chart'),
            xaxis_title=x_col,
            yaxis_title=', '.join(y_cols)
        )
        
        return fig
    
    def _create_waterfall(self, df: pd.DataFrame, config: Dict) -> go.Figure:
        """Create waterfall chart"""
        
        measure_col = config.get('measure', 'relative')
        x_col = config.get('x', df.columns[0])
        y_col = config.get('y', df.columns[1] if len(df.columns) > 1 else df.columns[0])
        
        fig = go.Figure(go.Waterfall(
            x=df[x_col],
            y=df[y_col],
            measure=[measure_col] * len(df),
            text=df[y_col].round(2).astype(str),
            textposition="outside",
            connector={"line": {"color": "rgb(63, 63, 63)"}}
        ))
        
        fig.update_layout(
            title=config.get('title', 'Waterfall Chart'),
            showlegend=False
        )
        
        return fig
    
    async def export_chart(self, chart_data: str, format: str = "png") -> bytes:
        """Export chart to various formats"""
        
        import plotly.io as pio
        
        fig = go.Figure(json.loads(chart_data))
        
        if format == "png":
            return pio.to_image(fig, format='png')
        elif format == "svg":
            return pio.to_image(fig, format='svg')
        elif format == "pdf":
            return pio.to_image(fig, format='pdf')
        else:
            return pio.to_html(fig, include_plotlyjs='cdn').encode()