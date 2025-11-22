import axios, { AxiosInstance } from 'axios';
import { AutoMLJobStatus, Playbook } from '../types';

const API_BASE_URL: string = (import.meta.env.VITE_API_URL as string) || '/api/v1';
const WS_BASE_URL: string = (import.meta.env.VITE_WS_URL as string) || (
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1/chat`
    : ''
);

interface ChatMessage {
  message: string;
  context?: any;
  model?: string;
}

interface ChatResponse {
  response: string;
  analysis?: {
    data?: any[];
    visualization?: any;
    visualizations?: any[]; // multiple charts
    report?: any;
    intent?: any;
    sql_query?: string;
    columns?: string[];
    row_count?: number;
    statistics?: Record<string, any>;
    error?: string;
  };
  error?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  mode: string;
  default?: boolean;
  deployment?: string;
}

interface AnalysisRequest {
  query: string;
  data?: any;
  analysis_type?: string;
  visualization_required?: boolean;
  connection_id?: string;
  database_context?: string;
  selected_tables?: string[];
  context?: Record<string, any>;
  model?: string;
}

interface AnalysisResponse {
  analysis_id: string;
  status: string;
  result?: any;
  error?: string;
}

interface ReportRequest {
  title: string;
  description?: string;
  data?: any;
  analysis_results?: any;
  format?: string;
  include_charts?: boolean;
  model?: string;
}

interface ReportResponse {
  report_id: string;
  title: string;
  status: string;
  created_at: string;
  url?: string;
  error?: string;
}

interface PlaybookRunRequest {
  playbook_id: string;
  params: Record<string, any>;
}

interface PlaybookRunResponse {
  status: string;
  job_id?: string;
  playbook_id?: string;
  summary?: string;
  error?: string;
}

class ApiClient {
  private axiosInstance: AxiosInstance;
  private wsConnection: WebSocket | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 seconds (chat/orchestrator can take longer on first run)
    });

    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Chat endpoints
  async sendChatMessage(
    message: string, 
    context?: any,
    signal?: AbortSignal,
    modelId?: string
  ): Promise<ChatResponse> {
    const payload: ChatMessage = { message, context };
    if (modelId) payload.model = modelId;
    const response = await this.axiosInstance.post<ChatResponse>(
      '/chat/message',
      payload,
      { signal }
    );
    return response.data;
  }

  async getChatHistory(limit: number = 50): Promise<{ messages: any[]; total: number }> {
    const response = await this.axiosInstance.get('/chat/history', {
      params: { limit },
    });
    return response.data;
  }

  // WebSocket connection for real-time chat
  connectWebSocket(
    onMessage: (data: any) => void,
    onError?: (error: any) => void,
    onClose?: () => void
  ): WebSocket {
    if (this.wsConnection) {
      this.wsConnection.close();
    }

    this.wsConnection = new WebSocket(`${WS_BASE_URL}/ws`);

    this.wsConnection.onopen = () => {
      console.log('WebSocket connected');
    };

    this.wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (onError) onError(error);
    };

    this.wsConnection.onclose = () => {
      console.log('WebSocket disconnected');
      if (onClose) onClose();
    };

    return this.wsConnection;
  }

  sendWebSocketMessage(message: any): void {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(message));
    }
  }

  closeWebSocket(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  // Analysis endpoints
  async runAnalysis(request: AnalysisRequest): Promise<AnalysisResponse> {
    const response = await this.axiosInstance.post<AnalysisResponse>(
      '/analysis/run',
      request
    );
    return response.data;
  }

  async getAnalysisResults(analysisId: string): Promise<AnalysisResponse> {
    const response = await this.axiosInstance.get<AnalysisResponse>(
      `/analysis/results/${analysisId}`
    );
    return response.data;
  }

  async getDatabaseSchema(): Promise<any> {
    const response = await this.axiosInstance.get('/analysis/schema');
    return response.data;
  }

  async getTables(): Promise<{ tables: string[] }> {
    const response = await this.axiosInstance.get('/analysis/tables');
    return response.data;
  }

  // Report endpoints
  async generateReport(request: ReportRequest): Promise<ReportResponse> {
    const response = await this.axiosInstance.post<ReportResponse>(
      '/reports/generate',
      request
    );
    return response.data;
  }

  async getReports(limit: number = 10): Promise<{ data: ReportResponse[] }> {
    const response = await this.axiosInstance.get('/reports', {
      params: { limit },
    });
    return response;
  }

  async getReport(reportId: string): Promise<{ data: ReportResponse }> {
    const response = await this.axiosInstance.get(`/reports/${reportId}`);
    return response;
  }

  async downloadReport(reportId: string): Promise<Blob> {
    const response = await this.axiosInstance.get(`/reports/download/${reportId}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async deleteReport(reportId: string): Promise<void> {
    await this.axiosInstance.delete(`/reports/${reportId}`);
  }

  // Health check
  async checkHealth(): Promise<{
    status: string;
    services: {
      api: string;
      database_connections: number;
      openai_configured: boolean;
    };
  }> {
    const response = await this.axiosInstance.get('/health');
    return response.data;
  }

  // API status
  async getApiStatus(): Promise<{
    database: {
      active_connections: number;
      available_drivers: string[];
    };
    configuration: {
      sql_config_present: boolean;
      openai_config_present: boolean;
      cors_origins: string[];
    };
    version: string;
  }> {
    const response = await this.axiosInstance.get('/status');
    return response.data;
  }

  // Playbooks + AutoML
  async listPlaybooks(): Promise<Playbook[]> {
    const response = await this.axiosInstance.get<Playbook[]>('/playbooks');
    return response.data;
  }

  async runPlaybook(request: PlaybookRunRequest): Promise<PlaybookRunResponse> {
    const response = await this.axiosInstance.post<PlaybookRunResponse>('/playbooks/run', request);
    return response.data;
  }

  async getAutomlJob(jobId: string): Promise<AutoMLJobStatus> {
    const response = await this.axiosInstance.get<AutoMLJobStatus>(`/automl/${jobId}`);
    return response.data;
  }

  // Utility methods
  setAuthToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  clearAuthToken(): void {
    localStorage.removeItem('auth_token');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  }
  async getAvailableModels(): Promise<{ models: ModelOption[]; default_model?: string }> {
    const response = await this.axiosInstance.get<{ models: ModelOption[]; default_model?: string }>('/chat/models');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export type { 
  ChatMessage, 
  ChatResponse, 
  AnalysisRequest, 
  AnalysisResponse, 
  ReportRequest, 
  ReportResponse,
  PlaybookRunRequest,
  PlaybookRunResponse,
};
