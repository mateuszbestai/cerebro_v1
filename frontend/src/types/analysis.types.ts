export interface AnalysisRequest {
    query: string;
    data?: any;
    analysis_type?: 'auto' | 'sql' | 'pandas';
    visualization_required?: boolean;
    connection_id?: string;
    database_context?: string;
    selected_tables?: string[];
    context?: Record<string, any>;
    model?: string;
  }
  
  export interface AnalysisResponse {
    analysis_id: string;
    status: 'processing' | 'completed' | 'failed';
    result?: AnalysisResult;
    error?: string;
  }
  
export interface AnalysisResult {
    query: string;
    intent: AnalysisIntent;
    response: string;
    data?: any;
    visualization?: ChartData;
    report?: string;
    statistics?: Record<string, any>;
    sql_query?: string;
    columns?: string[];
    row_count?: number;
    model?: string;
    timestamp?: string;
  }
  
  export interface AnalysisIntent {
    type: string;
    needs_visualization?: boolean;
    chart_type?: string;
  }
  
  export interface ChartData {
    type: string;
    data: string;
    config?: any;
  }
  
export interface AnalysisState {
    results: AnalysisResult[];
    currentResult?: AnalysisResult;
    history: AnalysisResult[];
    currentHistoryIndex: number;
    isAnalyzing: boolean;
    error?: string;
  }
