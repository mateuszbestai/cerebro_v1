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
    model?: string;
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

export interface Playbook {
  id: string;
  name: string;
  description: string;
  domain?: string;
  required_inputs?: string[];
  steps?: string[];
  defaults?: {
    target_column?: string;
    target_table?: string;
    metric?: string;
    time_limit_minutes?: number;
    max_trials?: number;
    task?: string;
  };
}

export interface PlaybookRunParams {
  playbook_id: string;
  params: Record<string, any>;
}

export interface AutoMLJobStatus {
  status: string;
  job_id: string;
  metrics?: Record<string, any>;
  summary?: string;
  error?: string;
}
