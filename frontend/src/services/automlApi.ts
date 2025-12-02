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
  PlaybookValidateRequest,
  PlaybookValidateResponse,
  PlaybookRunRequest,
  PlaybookRunResponse,
  PlaybookFromGDMRequest,
  FullResultsRequest,
  FullAutoMLResults,
  PlaybookConfig,
} from '../types/automl';
import { Playbook } from '../types';

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

  // ============================================================================
  // Playbook API Methods
  // ============================================================================

  /**
   * List all available playbooks
   */
  async listPlaybooks(): Promise<Playbook[]> {
    const response = await api.get('/playbooks');
    return response.data;
  },

  /**
   * Get a specific playbook by ID
   */
  async getPlaybook(playbookId: string): Promise<PlaybookConfig> {
    const response = await api.get(`/playbooks/${playbookId}`);
    return response.data;
  },

  /**
   * Validate a playbook configuration before execution
   */
  async validatePlaybook(request: PlaybookValidateRequest): Promise<PlaybookValidateResponse> {
    const response = await api.post('/playbooks/validate', request);
    return response.data;
  },

  /**
   * Run a playbook with optional validation
   */
  async runPlaybook(request: PlaybookRunRequest): Promise<PlaybookRunResponse> {
    const response = await api.post('/playbooks/run', request);
    return response.data;
  },

  /**
   * Generate a playbook from GDM results
   */
  async generatePlaybookFromGDM(request: PlaybookFromGDMRequest): Promise<{
    id: string;
    name: string;
    description?: string;
    domain?: string;
    required_inputs?: string[];
    steps?: string[];
    defaults?: Record<string, any>;
  }> {
    const response = await api.post('/playbooks/generate', request);
    return response.data;
  },

  // ============================================================================
  // Enhanced Results API Methods
  // ============================================================================

  /**
   * Get full results with business metrics and GPT-5 interpretation
   */
  async getFullResults(jobId: string, request?: FullResultsRequest): Promise<FullAutoMLResults> {
    const response = await api.post(`/automl/${jobId}/full-results`, request || {
      include_predictions: true,
      predictions_limit: 100,
      compute_business_metrics: true,
      generate_interpretation: true,
    });
    return response.data;
  },

  /**
   * Generate or regenerate GPT-5 interpretation
   */
  async generateInterpretation(jobId: string, businessContext?: string): Promise<{
    job_id: string;
    interpretation: {
      executive_summary: string;
      key_findings: Array<{
        finding: string;
        evidence: string;
        business_implication: string;
      }>;
      recommended_actions: Array<{
        action: string;
        priority: 'high' | 'medium' | 'low';
        expected_impact: string;
      }>;
      model_assessment: {
        strengths: string[];
        limitations: string[];
        confidence_level: 'high' | 'medium' | 'low';
      };
      next_steps: string[];
      caveats: string[];
    };
  }> {
    const response = await api.post(`/automl/${jobId}/interpret`, {
      business_context: businessContext,
    });
    return response.data;
  },

  /**
   * Get AutoML job from playbooks endpoint (for playbook-based jobs)
   */
  async getPlaybookJobStatus(jobId: string): Promise<{
    job_id: string;
    status: string;
    progress_pct?: number;
    current_step?: string;
    models_trained?: number;
    best_model?: string;
    best_score?: number;
    elapsed_seconds?: number;
    error?: string;
    results?: FullAutoMLResults;
  }> {
    const response = await api.get(`/automl/${jobId}`);
    return response.data;
  },
};

export default automlApi;
