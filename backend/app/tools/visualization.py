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
    
    async def create_multiple_charts(
        self,
        data: Any,
        analysis_type: str = "comprehensive",
        config: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """
        Create multiple charts for comprehensive data analysis
        """
        try:
            df = self._prepare_dataframe(data)
            charts = []
            
            # Determine which charts to create based on data characteristics
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
            
            if analysis_type == "comprehensive" or analysis_type == "auto":
                # Create multiple relevant charts based on data
                
                # 1. Distribution charts for numeric columns
                if len(numeric_cols) > 0:
                    # Histogram for first numeric column
                    for col in numeric_cols[:3]:  # Limit to first 3 numeric columns
                        try:
                            hist_fig = px.histogram(
                                df, x=col, 
                                title=f"Distribution of {col}",
                                nbins=30
                            )
                            hist_fig.update_layout(**self.default_layout)
                            charts.append({
                                "type": "histogram",
                                "title": f"Distribution of {col}",
                                "data": hist_fig.to_json(),
                                "config": self._get_chart_config()
                            })
                        except Exception as e:
                            logger.debug(f"Could not create histogram for {col}: {e}")
                
                # 2. Correlation heatmap if multiple numeric columns
                if len(numeric_cols) >= 2:
                    try:
                        corr_matrix = df[numeric_cols].corr()
                        heatmap_fig = px.imshow(
                            corr_matrix,
                            title="Correlation Heatmap",
                            color_continuous_scale="RdBu",
                            aspect="auto"
                        )
                        heatmap_fig.update_layout(**self.default_layout)
                        charts.append({
                            "type": "heatmap",
                            "title": "Correlation Heatmap",
                            "data": heatmap_fig.to_json(),
                            "config": self._get_chart_config()
                        })
                    except Exception as e:
                        logger.debug(f"Could not create correlation heatmap: {e}")
                
                # 3. Bar charts for categorical vs numeric
                if len(categorical_cols) > 0 and len(numeric_cols) > 0:
                    cat_col = categorical_cols[0]
                    num_col = numeric_cols[0]
                    
                    # Check if categorical column has reasonable number of unique values
                    if df[cat_col].nunique() <= 20:
                        try:
                            # Aggregated bar chart
                            agg_df = df.groupby(cat_col)[num_col].mean().reset_index()
                            bar_fig = px.bar(
                                agg_df, x=cat_col, y=num_col,
                                title=f"Average {num_col} by {cat_col}"
                            )
                            bar_fig.update_layout(**self.default_layout)
                            charts.append({
                                "type": "bar",
                                "title": f"Average {num_col} by {cat_col}",
                                "data": bar_fig.to_json(),
                                "config": self._get_chart_config()
                            })
                        except Exception as e:
                            logger.debug(f"Could not create bar chart: {e}")
                
                # 4. Time series if date column detected
                date_cols = df.select_dtypes(include=['datetime64']).columns.tolist()
                if not date_cols:
                    # Try to detect date columns by name
                    potential_date_cols = [col for col in df.columns if 
                                          any(date_word in col.lower() for date_word in 
                                          ['date', 'time', 'created', 'updated', 'timestamp'])]
                    for col in potential_date_cols:
                        try:
                            df[col] = pd.to_datetime(df[col])
                            date_cols.append(col)
                        except:
                            pass
                
                if date_cols and len(numeric_cols) > 0:
                    date_col = date_cols[0]
                    for num_col in numeric_cols[:2]:  # Limit to 2 time series
                        try:
                            line_fig = px.line(
                                df.sort_values(date_col),
                                x=date_col, y=num_col,
                                title=f"{num_col} Over Time"
                            )
                            line_fig.update_layout(**self.default_layout)
                            charts.append({
                                "type": "line",
                                "title": f"{num_col} Over Time",
                                "data": line_fig.to_json(),
                                "config": self._get_chart_config()
                            })
                        except Exception as e:
                            logger.debug(f"Could not create time series: {e}")
                
                # 5. Scatter plot for numeric relationships
                if len(numeric_cols) >= 2:
                    try:
                        scatter_fig = px.scatter(
                            df, x=numeric_cols[0], y=numeric_cols[1],
                            title=f"{numeric_cols[1]} vs {numeric_cols[0]}",
                            trendline="ols" if len(df) > 10 else None
                        )
                        scatter_fig.update_layout(**self.default_layout)
                        charts.append({
                            "type": "scatter",
                            "title": f"{numeric_cols[1]} vs {numeric_cols[0]}",
                            "data": scatter_fig.to_json(),
                            "config": self._get_chart_config()
                        })
                    except Exception as e:
                        logger.debug(f"Could not create scatter plot: {e}")
            
            # If no charts were created, create at least one default chart
            if not charts:
                default_chart = await self.create_chart(data, "auto", config)
                default_chart["title"] = "Data Overview"
                charts.append(default_chart)
            
            return charts
            
        except Exception as e:
            logger.error(f"Error creating multiple charts: {str(e)}")
            # Return single chart as fallback
            default_chart = await self.create_chart(data, "auto", config)
            default_chart["title"] = "Data Overview"
            return [default_chart]
    
    def _get_chart_config(self) -> Dict[str, Any]:
        """Get default chart configuration"""
        return {
            "responsive": True,
            "displayModeBar": True,
            "displaylogo": False,
            "toImageButtonOptions": {
                "format": "png",
                "filename": "chart",
                "height": 500,
                "width": 700,
                "scale": 1
            }
        }
    
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