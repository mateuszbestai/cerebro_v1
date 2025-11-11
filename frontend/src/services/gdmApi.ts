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

  getArtifactUrl(jobId: string, artifactName: string): string {
    return `${API_BASE_URL}/gdm/artifact/${jobId}/${encodeURIComponent(artifactName)}`;
  }
}

export const gdmApi = new GDMApi();
