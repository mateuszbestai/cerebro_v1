export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    error?: boolean;
    analysis?: any;
    metadata?: Record<string, any>;
  }
  
  export interface AnalysisResult {
    query: string;
    intent: {
      type: string;
      needs_visualization?: boolean;
      chart_type?: string;
      multiple_charts?: boolean;
    };
    response: string;
    data?: any;
    visualization?: ChartData;
    visualizations?: ChartData[];
    sql_query?: string;
    columns?: string[];
    row_count?: number;
    report?: string;
    statistics?: Record<string, any>;
    timestamp?: string;
  }
  
  export interface ChartData {
    type: string;
    title?: string;
    data: string; // JSON string
    config?: any;
  }
  
  export interface Report {
    id: string;
    title: string;
    content: string;
    created_at: string;
    metadata?: Record<string, any>;
  }
  
  export interface ChatState {
    messages: Message[];
    isLoading: boolean;
    currentAnalysis?: AnalysisResult;
    error?: string;
  }
  
  export interface AnalysisState {
    results: AnalysisResult[];
    history: AnalysisResult[];
    currentResult?: AnalysisResult;
    currentHistoryIndex: number;
    isAnalyzing: boolean;
    error?: string;
  }
