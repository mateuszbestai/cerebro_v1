import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
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
  async sendChatMessage(message: string, context?: any) {
    return this.client.post('/chat/message', { message, context });
  }

  async getChatHistory() {
    return this.client.get('/chat/history');
  }

  // Analysis endpoints
  async runAnalysis(query: string, data?: any) {
    return this.client.post('/analysis/run', { query, data });
  }

  async getAnalysisResults(analysisId: string) {
    return this.client.get(`/analysis/results/${analysisId}`);
  }

  // Report endpoints
  async generateReport(params: any) {
    return this.client.post('/reports/generate', params);
  }

  async getReports() {
    return this.client.get('/reports');
  }

  async getReport(reportId: string) {
    return this.client.get(`/reports/${reportId}`);
  }

  // Database info
  async getDatabaseSchema() {
    return this.client.get('/analysis/schema');
  }

  async getTables() {
    return this.client.get('/analysis/tables');
  }
}

export const apiClient = new ApiClient();