/**
 * AutoML API Service
 *
 * Handles all AutoML-related API calls for the wizard interface.
 */

import axios from 'axios';
import {
  AutoMLStartRequest,
  AutoMLStartResponse,
  AutoMLStatusResponse,
  AutoMLResultsResponse,
  PresetInfo,
  MetricInfo,
  UploadResponse,
  AutoMLJobSummary,
} from '../types/automl';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minutes for long operations
});

export const automlApi = {
  /**
   * Check if AutoGluon service is available
   */
  async getServiceStatus(): Promise<{ available: boolean; message: string }> {
    const response = await api.get('/automl/status');
    return response.data;
  },

  /**
   * Get available training presets
   */
  async getPresets(): Promise<{ presets: PresetInfo[] }> {
    const response = await api.get('/automl/presets');
    return response.data;
  },

  /**
   * Get available evaluation metrics
   */
  async getMetrics(): Promise<{
    classification: MetricInfo[];
    regression: MetricInfo[];
  }> {
    const response = await api.get('/automl/metrics');
    return response.data;
  },

  /**
   * Start a new AutoML training job
   */
  async startJob(request: AutoMLStartRequest): Promise<AutoMLStartResponse> {
    const response = await api.post('/automl/start', request);
    return response.data;
  },

  /**
   * Get status of an AutoML job
   */
  async getJobStatus(jobId: string): Promise<AutoMLStatusResponse> {
    const response = await api.get(`/automl/${jobId}/status`);
    return response.data;
  },

  /**
   * Get results of a completed job
   */
  async getJobResults(jobId: string): Promise<AutoMLResultsResponse> {
    const response = await api.get(`/automl/${jobId}/results`);
    return response.data;
  },

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await api.post(`/automl/${jobId}/cancel`);
    return response.data;
  },

  /**
   * Get model leaderboard for a completed job
   */
  async getLeaderboard(jobId: string): Promise<{
    job_id: string;
    leaderboard: any[];
    best_model: string;
    best_score: number;
  }> {
    const response = await api.get(`/automl/${jobId}/leaderboard`);
    return response.data;
  },

  /**
   * Get feature importance for a completed job
   */
  async getFeatureImportance(jobId: string): Promise<{
    job_id: string;
    feature_importance: Record<string, number>;
  }> {
    const response = await api.get(`/automl/${jobId}/feature-importance`);
    return response.data;
  },

  /**
   * Make predictions using a trained model
   */
  async predict(jobId: string, data: Record<string, any>[]): Promise<{
    job_id: string;
    predictions: (string | number)[];
    probabilities?: Record<string, number>[];
  }> {
    const response = await api.post(`/automl/${jobId}/predict`, { data });
    return response.data;
  },

  /**
   * List all AutoML jobs
   */
  async listJobs(): Promise<{ jobs: AutoMLJobSummary[] }> {
    const response = await api.get('/automl/jobs');
    return response.data;
  },

  /**
   * Delete a job and its model files
   */
  async deleteJob(jobId: string): Promise<{ success: boolean; job_id: string }> {
    const response = await api.delete(`/automl/${jobId}`);
    return response.data;
  },

  /**
   * Upload a training data file
   */
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/automl/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes for large files
    });
    return response.data;
  },

  /**
   * Get table data preview from database
   */
  async getTablePreview(
    connectionId: string,
    tableName: string,
    schemaName: string = 'dbo',
    limit: number = 100
  ): Promise<{
    rows: Record<string, any>[];
    columns: string[];
    dtypes: Record<string, string>;
    total_rows: number;
  }> {
    const response = await api.get('/database/preview', {
      params: {
        connection_id: connectionId,
        table_name: tableName,
        schema_name: schemaName,
        limit,
      },
    });
    return response.data;
  },
};

export default automlApi;
