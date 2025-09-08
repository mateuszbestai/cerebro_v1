export const API_ENDPOINTS = {
    CHAT: '/chat',
    ANALYSIS: '/analysis',
    REPORTS: '/reports',
    DATABASE: '/database',
  };
  
  export const CHART_TYPES = {
    BAR: 'bar',
    LINE: 'line',
    SCATTER: 'scatter',
    PIE: 'pie',
    HEATMAP: 'heatmap',
    BOX: 'box',
    HISTOGRAM: 'histogram',
    SUNBURST: 'sunburst',
    TREEMAP: 'treemap',
    WATERFALL: 'waterfall',
    TABLE: 'table',
  };
  
  export const REPORT_FORMATS = {
    PDF: 'pdf',
    HTML: 'html',
    MARKDOWN: 'markdown',
    DOCX: 'docx',
  };
  
  export const ANALYSIS_TYPES = {
    AUTO: 'auto',
    SQL: 'sql',
    PANDAS: 'pandas',
    GENERAL: 'general',
  };
  
  export const MESSAGE_TEMPLATES = [
    'Show me the top 10 customers by revenue',
    'What are the sales trends for the last quarter?',
    'Analyze customer churn patterns',
    'Generate a monthly performance report',
    'Compare revenue across different regions',
    'Find anomalies in transaction data',
    'Calculate year-over-year growth',
    'Identify best-selling products',
  ];
  
  export const DATE_FORMATS = {
    SHORT: 'MM/DD/YYYY',
    LONG: 'MMMM DD, YYYY',
    TIME: 'HH:mm:ss',
    DATETIME: 'MM/DD/YYYY HH:mm',
  };