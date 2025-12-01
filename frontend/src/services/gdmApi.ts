import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api/v1';

export interface GDMCreatePayload {
  database_id: string;
  model?: 'gpt-5' | 'gpt-4.1';
  connection?: Record<string, any>;
}

export interface GDMCreateResponse {
  job_id: string;
  model_used: string;
  status: string;
  warnings: string[];
}

export interface GDMArtifact {
  name: string;
  download_url: string;
  path: string;
  relative_path?: string;
}

export interface GDMStatusResponse {
  job_id: string;
  status: string;
  step: string;
  progress: number;
  message: string;
  model_used: string;
  logs: Array<{ timestamp: string; step: string; message: string }>;
  warnings: string[];
  artifacts: GDMArtifact[];
  summary?: Record<string, any>;
  completed_at?: string | null;
}

export interface GDMEntityColumn {
  name: string;
  type?: string;
  nullable?: boolean;
  max_length?: number | null;
  default?: string | null;
  is_primary_key?: boolean;
   semantic_type?: string;
   semantic_description?: string;
}

export interface GDMGraphNode {
  id: string;
  label: string;
  schema: string;
  name: string;
  type: string;
  row_count?: number;
  column_count?: number;
  degree: number;
  columns: GDMEntityColumn[];
  tags: string[];
  profile?: Record<string, any>;
  position: { x: number; y: number };
  business_process?: string;
  feature_time?: FeatureAvailabilityHint;
  kpi_columns?: string[];
  target_recommendations?: AutomlTargetRecommendation[];
}

export interface GDMGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  confidence?: number;
  strategy?: string;
}

export interface GDMResultsStats {
  facts: number;
  dimensions: number;
  avg_degree: number;
  max_degree: number;
  isolated_nodes: number;
}

export interface FeatureAvailabilityHint {
  table?: string;
  column: string;
  reason: string;
}

export interface AutomlTargetRecommendation {
  table: string;
  column: string;
  task: string;
  reason: string;
  semantic_type?: string;
  business_process?: string;
  row_count?: number;
  feature_time?: FeatureAvailabilityHint;
}

export interface BusinessProcessHint {
  table: string;
  process: string;
  confidence: number;
  reason: string;
}

export interface KPISignal {
  table: string;
  column: string;
  semantic_type?: string;
  definition?: string;
}

export interface FeatureSuggestion {
  table: string;
  features: string[];
  reason: string;
  feature_time?: FeatureAvailabilityHint;
}

export interface ColumnSemantic {
  table: string;
  column: string;
  semantic_type: string;
  description?: string;
}

export interface AutomlGuidance {
  recommended_targets: AutomlTargetRecommendation[];
  feature_availability: FeatureAvailabilityHint[];
  business_processes: BusinessProcessHint[];
  kpi_columns: KPISignal[];
  feature_suggestions: FeatureSuggestion[];
  semantic_columns: ColumnSemantic[];
}

export interface GDMTimelineItem {
  id: string;
  label: string;
  description: string;
  timestamp?: string | null;
  status: string;
}

export interface GDMResultsResponse {
  job_id: string;
  database_id?: string;
  model_used?: string;
  completed_at?: string;
  graph: { nodes: GDMGraphNode[]; edges: GDMGraphEdge[] };
  entity_count: number;
  relationship_count: number;
  summary?: Record<string, any>;
  artifacts: GDMArtifact[];
  missing_artifacts: string[];
  warnings: string[];
  timeline: GDMTimelineItem[];
  stats: GDMResultsStats;
  glossary_terms: number;
  ai_usage_enabled: boolean;
  relationship_overview: Record<string, number>;
  automl_guidance?: AutomlGuidance;
}

export interface GDMNaturalLanguageSummary {
  job_id: string;
  entity_count: number;
  relationship_count: number;
  summary: string;
  top_entities: string[];
  notable_measures: string[];
}

export interface GDMInsight {
  id: string;
  title: string;
  value: string;
  description: string;
  severity: 'info' | 'warning' | 'critical' | string;
  affected_nodes: string[];
  supporting?: Array<Record<string, any>>;
  details?: Array<Record<string, any>>;
}

export interface GDMRelationshipRecord {
  id: string;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column?: string | null;
  confidence: number;
  strategy?: string;
  status: string;
  evidence?: string;
  preview_sql?: string;
  test_status?: Record<string, any>;
  last_tested?: string;
}

export interface GDMRelationshipReview {
  job_id: string;
  confirmed: GDMRelationshipRecord[];
  candidates: GDMRelationshipRecord[];
}

export interface UseForAIResponse {
  job_id: string;
  enabled: boolean;
  updated_at?: string | null;
}

class GDMApi {
  private axiosInstance = axios.create({
    baseURL: `${API_BASE_URL}/gdm`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  async create(payload: GDMCreatePayload): Promise<GDMCreateResponse> {
    const response = await this.axiosInstance.post<GDMCreateResponse>('/create', payload);
    return response.data;
  }

  async getStatus(jobId: string): Promise<GDMStatusResponse> {
    const response = await this.axiosInstance.get<GDMStatusResponse>(`/status/${jobId}`);
    return response.data;
  }

  async getResults(jobId: string): Promise<GDMResultsResponse> {
    const response = await this.axiosInstance.get<GDMResultsResponse>(`/results/${jobId}`);
    return response.data;
  }

  async getNaturalLanguageSummary(jobId: string): Promise<GDMNaturalLanguageSummary> {
    const response = await this.axiosInstance.get<GDMNaturalLanguageSummary>(`/nl_summary/${jobId}`);
    return response.data;
  }

  async getInsights(jobId: string): Promise<GDMInsight[]> {
    const response = await this.axiosInstance.get<GDMInsight[]>(`/insights/${jobId}`);
    return response.data;
  }

  async getRelationships(jobId: string): Promise<GDMRelationshipReview> {
    const response = await this.axiosInstance.get<GDMRelationshipReview>(`/relationships/${jobId}`);
    return response.data;
  }

  async confirmRelationships(jobId: string, relationshipIds: string[]): Promise<GDMRelationshipReview> {
    const response = await this.axiosInstance.post<GDMRelationshipReview>('/relationships/confirm', {
      job_id: jobId,
      relationship_ids: relationshipIds,
    });
    return response.data;
  }

  async setUseForAI(jobId: string, enable: boolean): Promise<UseForAIResponse> {
    const response = await this.axiosInstance.post<UseForAIResponse>('/use-for-ai', {
      job_id: jobId,
      enable,
    });
    return response.data;
  }

  async getUseForAI(jobId: string): Promise<UseForAIResponse> {
    const response = await this.axiosInstance.get<UseForAIResponse>(`/use-for-ai/${jobId}`);
    return response.data;
  }

  getArtifactUrl(jobId: string, artifactName: string): string {
    return `${API_BASE_URL}/gdm/artifact/${jobId}/${encodeURIComponent(artifactName)}`;
  }

  async fetchArtifactText(jobId: string, artifactName: string): Promise<string> {
    const response = await this.axiosInstance.get<string>(`/artifact/${jobId}/${artifactName}`, {
      responseType: 'text',
      transformResponse: [(data) => data],
    });
    return response.data;
  }

  async fetchArtifactJson<T = any>(jobId: string, artifactName: string): Promise<T> {
    const response = await this.axiosInstance.get<T>(`/artifact/${jobId}/${artifactName}`);
    return response.data;
  }
}

export const gdmApi = new GDMApi();
