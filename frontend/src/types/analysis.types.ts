export interface AnalysisRequest {
    query: string;
    data?: any;
    analysis_type?: 'auto' | 'sql' | 'pandas';
    visualization_required?: boolean;
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
    isAnalyzing: boolean;
    error?: string;
  }