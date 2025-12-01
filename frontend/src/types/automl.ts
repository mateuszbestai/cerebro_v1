/**
 * AutoML TypeScript Types
 */

export type TaskType = 'classification' | 'regression';
export type Preset = 'quick' | 'balanced' | 'thorough';
export type DataSource = 'database' | 'gdm' | 'file';
export type JobStatus = 'pending' | 'preparing' | 'training' | 'evaluating' | 'completed' | 'failed' | 'cancelled';

export interface PresetInfo {
  name: Preset;
  time_limit: number;
  description: string;
}

export interface MetricInfo {
  name: string;
  display_name: string;
  task: TaskType;
  description: string;
}

export interface DatabaseSourceConfig {
  connection_id: string;
  table_name: string;
  schema_name?: string;
  query?: string;
}

export interface GDMSourceConfig {
  job_id: string;
  table_name: string;
}

export interface FileSourceConfig {
  file_path: string;
}

export type SourceConfig = DatabaseSourceConfig | GDMSourceConfig | FileSourceConfig;

export interface AutoMLStartRequest {
  task: TaskType;
  target_column: string;
  source: DataSource;
  source_config: SourceConfig;
  preset?: Preset;
  excluded_columns?: string[];
  eval_metric?: string;
  holdout_frac?: number;
  time_limit?: number;
  job_name?: string;
  tags?: Record<string, string>;
}

export interface AutoMLStartResponse {
  job_id: string | null;
  status: string;
  error?: string;
}

export interface AutoMLStatusResponse {
  job_id: string;
  status: JobStatus;
  progress_pct: number;
  current_step: string;
  models_trained: number;
  best_model: string | null;
  best_score: number | null;
  elapsed_seconds: number;
  estimated_remaining: number | null;
  log_messages: string[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface LeaderboardEntry {
  model: string;
  score_val: number;
  pred_time_val?: number;
  fit_time?: number;
  pred_time_val_marginal?: number;
  fit_time_marginal?: number;
  stack_level?: number;
  can_infer?: boolean;
  fit_order?: number;
}

export interface PredictionSample {
  actual: string | number;
  predicted: string | number;
  probabilities?: Record<string, number>;
}

export interface AutoMLResultsResponse {
  job_id: string;
  status: string;
  task: TaskType;
  target_column: string;
  leaderboard: LeaderboardEntry[];
  best_model: string;
  best_score: number;
  eval_metric: string;
  feature_importance: Record<string, number>;
  training_time_seconds: number;
  num_rows_train: number;
  num_features: number;
  model_path: string;
  predictions_sample?: PredictionSample[];
  confusion_matrix?: number[][];
  class_labels?: string[];
  insights?: AutoMLInsights;
}

export interface AutoMLInsights {
  executive_summary: string;
  accuracy_explanation: string;
  key_insights: KeyInsight[];
  recommendation: string;
  caveats: string[];
}

export interface KeyInsight {
  feature: string;
  insight: string;
  business_action: string;
}

export interface UploadResponse {
  file_path: string;
  filename: string;
  rows: number;
  columns: string[];
  dtypes: Record<string, string>;
}

export interface AutoMLJobSummary {
  job_id: string;
  status: JobStatus;
  progress_pct: number;
  started_at: string | null;
  completed_at: string | null;
}

// Wizard state types
export interface WizardState {
  step: number;
  dataSource: DataSource | null;
  sourceConfig: SourceConfig | null;
  selectedTable: string | null;
  targetColumn: string | null;
  task: TaskType;
  preset: Preset;
  excludedColumns: string[];
  evalMetric: string | null;
  columns: ColumnInfo[];
  previewData: Record<string, any>[];
  jobId: string | null;
}

export interface ColumnInfo {
  name: string;
  dtype: string;
  nullable?: boolean;
  sample_values?: any[];
  null_pct?: number;
  cardinality?: number;
  is_recommended_target?: boolean;
  recommended_task?: TaskType;
  recommendation_reason?: string;
}

// GDM integration types
export interface GDMTargetRecommendation {
  table: string;
  column: string;
  task: TaskType;
  reason: string;
  semantic_type?: string;
  business_process?: string;
  has_warnings?: boolean;
}

export interface GDMDataReadiness {
  status: 'ready' | 'review_needed' | 'insufficient_data';
  sufficient_rows: boolean;
  sufficient_features: boolean;
  has_target_candidates: boolean;
  total_rows: number;
  total_features: number;
  recommendation: string;
}

export interface GDMAutoMLGuidance {
  recommended_targets: GDMTargetRecommendation[];
  data_readiness: GDMDataReadiness;
  target_warnings?: Array<{
    table: string;
    column: string;
    warnings: string[];
    severity: 'low' | 'medium' | 'high';
  }>;
  feature_suggestions?: Array<{
    table: string;
    features: string[];
    reason: string;
  }>;
}
