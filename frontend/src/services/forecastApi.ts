/**
 * Forecast API Service
 *
 * Handles API calls for GPT-5 powered forecasting and business intelligence.
 */

import axios from 'axios';
import {
  ForecastRequest,
  ForecastResult,
  ForecastStatusResponse,
} from '../types/forecast';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 180000, // 3 minutes for LLM operations
});

export const forecastApi = {
  /**
   * Generate forecasts and business insights for an AutoML job
   */
  async generate(request: ForecastRequest): Promise<ForecastResult> {
    const response = await api.post('/forecasts/generate', request);
    return response.data;
  },

  /**
   * Get status of a forecast generation job
   */
  async getStatus(jobId: string): Promise<ForecastStatusResponse> {
    const response = await api.get(`/forecasts/${jobId}/status`);
    return response.data;
  },

  /**
   * Get a previously generated forecast result
   */
  async getResult(jobId: string): Promise<ForecastResult> {
    const response = await api.get(`/forecasts/${jobId}`);
    return response.data;
  },

  /**
   * List all forecast jobs for a given AutoML job
   */
  async listByAutoMLJob(automlJobId: string): Promise<{ forecasts: ForecastResult[] }> {
    const response = await api.get(`/forecasts/automl/${automlJobId}`);
    return response.data;
  },

  /**
   * Regenerate insights with additional context
   */
  async regenerateWithContext(
    jobId: string,
    additionalContext: string
  ): Promise<ForecastResult> {
    const response = await api.post(`/forecasts/${jobId}/regenerate`, {
      additional_context: additionalContext,
    });
    return response.data;
  },

  /**
   * Export forecast data as CSV
   */
  async exportCsv(jobId: string): Promise<Blob> {
    const response = await api.get(`/forecasts/${jobId}/export/csv`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Get available time columns for a table
   */
  async getTimeColumns(
    connectionId: string,
    tableName: string
  ): Promise<{ columns: string[] }> {
    const response = await api.get('/forecasts/time-columns', {
      params: { connection_id: connectionId, table_name: tableName },
    });
    return response.data;
  },
};

export default forecastApi;
