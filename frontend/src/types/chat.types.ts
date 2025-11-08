import type { AnalysisResult } from './analysis.types';

export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    error?: boolean;
    metadata?: MessageMetadata;
  }
  
export interface MessageMetadata {
    analysis_id?: string;
    has_visualization?: boolean;
    has_data?: boolean;
    query_type?: string;
    model?: string;
    chat_session_id?: string;
    table_context?: string[];
    execution_time?: number;
    sql_query?: string;
  }
  
  export interface ChatState {
    messages: Message[];
    isLoading: boolean;
    currentAnalysis?: AnalysisResult;
    error?: string;
    sessionId?: string;
  }
  
  export interface ChatRequest {
    message: string;
    context?: any;
    session_id?: string;
    model?: string;
  }
  
  export interface ChatResponse {
    response: string;
    analysis?: any;
    error?: string;
  }
  
  // Re-export from analysis.types.ts
  export type { AnalysisResult, ChartData } from './analysis.types';
