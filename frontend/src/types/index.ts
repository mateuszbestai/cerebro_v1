export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    error?: boolean;
    metadata?: Record<string, any>;
  }
  
  export interface AnalysisResult {
    query: string;
    intent: {
      type: string;
      needs_visualization?: boolean;
      chart_type?: string;
    };
    response: string;
    data?: any;
    visualization?: ChartData;
    report?: string;
    statistics?: Record<string, any>;
  }
  
  export interface ChartData {
    type: string;
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
    currentResult?: AnalysisResult;
    isAnalyzing: boolean;
    error?: string;
  }