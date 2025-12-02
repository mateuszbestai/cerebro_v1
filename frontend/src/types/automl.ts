/**
 * AutoML TypeScript Types
 *
 * Matches backend/app/models/playbook_models.py Pydantic models
 */

// ============================================================================
// Core Enums
// ============================================================================

export type ProblemType = 'classification' | 'regression' | 'forecasting' | 'clustering' | 'anomaly';
export type TaskType = ProblemType; // Alias for backwards compatibility
export type Preset = 'quick' | 'balanced' | 'thorough';
export type DataSource = 'database' | 'gdm' | 'file';
export type JobStatus = 'pending' | 'preparing' | 'training' | 'evaluating' | 'completed' | 'failed' | 'cancelled';
export type SplitStrategy = 'random' | 'temporal' | 'stratified' | 'custom';
export type ColumnRole = 'feature' | 'target' | 'identifier' | 'timestamp' | 'excluded';
export type DataReadinessStatus = 'ready' | 'review_needed' | 'insufficient_data';
export type LeakageRiskSeverity = 'low' | 'medium' | 'high';
export type SchemaIssueSeverity = 'warning' | 'error';

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
  recommendation_message?: string | null;
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

// ============================================================================
// Playbook Configuration Types
// ============================================================================

export interface BusinessCostWeights {
  false_positive_cost: number;
  false_negative_cost: number;
  true_positive_value: number;
  true_negative_value: number;
}

export interface DataSourceConfig {
  type: DataSource;
  gdm_job_id?: string;
  table_name?: string;
  connection_id?: string;
  query?: string;
  file_path?: string;
}

export interface ColumnConfig {
  name: string;
  role: ColumnRole;
  dtype?: string;
  transformation?: string;
}

export interface PlaybookConfig {
  id: string;
  name: string;
  description?: string;
  problem_type: ProblemType;
  target_column: string;
  prediction_horizon?: number;
  event_time_column?: string;
  entity_id_column?: string;
  forbidden_columns: string[];
  allowed_columns?: string[];
  column_configs?: ColumnConfig[];
  split_strategy: SplitStrategy;
  split_column?: string;
  test_size: number;
  primary_metric: string;
  secondary_metrics?: string[];
  business_cost_weights?: BusinessCostWeights;
  time_limit_minutes: number;
  max_models: number;
  preset: Preset;
  source: DataSourceConfig;
  gdm_job_id?: string;
  tags: Record<string, string>;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface LeakageRisk {
  column: string;
  risk_type: string;
  severity: LeakageRiskSeverity;
  evidence: string;
  recommendation: string;
}

export interface SchemaIssue {
  column: string;
  issue_type: string;
  severity: SchemaIssueSeverity;
  message: string;
  suggestion?: string;
}

export interface PlaybookValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  leakage_risks: LeakageRisk[];
  schema_issues: SchemaIssue[];
  row_count?: number;
  feature_count?: number;
  target_distribution?: Record<string, number>;
  data_readiness: DataReadinessStatus;
}

export interface PlaybookValidateRequest {
  playbook_id: string;
  params: Record<string, any>;
  check_leakage?: boolean;
  sample_size?: number;
}

export interface PlaybookValidateResponse extends PlaybookValidationResult {}

// ============================================================================
// Business Metrics Types
// ============================================================================

export interface ThresholdCurvePoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  cost: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface ThresholdAnalysis {
  optimal_threshold: number;
  optimal_metric_value: number;
  precision_at_threshold: number;
  recall_at_threshold: number;
  f1_at_threshold: number;
  expected_cost_at_threshold: number;
  threshold_curve: ThresholdCurvePoint[];
}

export interface CapturePoint {
  percentile: number;
  capture_rate: number;
  cumulative_count: number;
}

export interface LiftDecile {
  decile: number;
  lift: number;
  cumulative_lift: number;
  response_rate: number;
  count: number;
}

export interface GainsSummary {
  capture_curve: CapturePoint[];
  lift_by_decile: LiftDecile[];
  auc_capture: number;
  top_10_capture: number;
  top_20_capture: number;
}

// ============================================================================
// Explanation Types (SHAP)
// ============================================================================

export interface GlobalExplanation {
  feature_importance: Record<string, number>;
  shap_summary?: {
    mean_abs_shap: Record<string, number>;
    std_shap: Record<string, number>;
    positive_ratio: Record<string, number>;
  };
  method: 'shap' | 'model_native' | 'unavailable';
  sample_size: number;
}

export interface LocalExplanation {
  record_index: number;
  contributions: Record<string, number>;
  base_value?: number;
  method: 'shap' | 'unavailable';
}

export interface FeatureInteraction {
  feature_1: string;
  feature_2: string;
  interaction_strength: number;
}

// ============================================================================
// AutoML Results Types (Extended)
// ============================================================================

export interface ForecastResult {
  forecast: Array<{
    timestamp: string;
    prediction: number;
    lower_bound?: number;
    upper_bound?: number;
  }>;
  evaluation_metrics: Record<string, number>;
  prediction_horizon: number;
}

export interface ClusterResult {
  cluster_labels: number[];
  n_clusters: number;
  cluster_centers?: number[][];
  cluster_sizes: Record<number, number>;
  silhouette_score?: number;
  cluster_statistics: Array<{
    cluster_id: number;
    size: number;
    percentage: number;
    centroid: Record<string, number>;
    top_features: Array<{
      feature: string;
      cluster_mean: number;
      overall_mean: number;
      z_score: number;
      direction: 'higher' | 'lower';
    }>;
  }>;
}

export interface AnomalyResult {
  anomaly_scores: number[];
  is_anomaly: boolean[];
  threshold: number;
  n_anomalies: number;
  contamination: number;
  anomaly_statistics: {
    total_anomalies: number;
    anomaly_rate: number;
    threshold_used: number;
    score_distribution: {
      min: number;
      max: number;
      mean: number;
      median: number;
      std: number;
      p90: number;
      p95: number;
      p99: number;
    };
  };
}

export interface GPT5Interpretation {
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
}

export interface FullAutoMLResults extends AutoMLResultsResponse {
  // Extended results
  threshold_analysis?: ThresholdAnalysis;
  gains_summary?: GainsSummary;
  global_explanation?: GlobalExplanation;
  local_explanations?: LocalExplanation[];
  feature_interactions?: FeatureInteraction[];
  interpretation?: GPT5Interpretation;

  // Problem-specific results
  forecast_result?: ForecastResult;
  cluster_result?: ClusterResult;
  anomaly_result?: AnomalyResult;

  // Error tracking
  business_metrics_error?: string;
  interpretation_error?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface PlaybookRunRequest {
  playbook_id: string;
  params: Record<string, any>;
  skip_validation?: boolean;
}

export interface PlaybookRunResponse {
  status: string;
  job_id?: string;
  playbook_id?: string;
  playbook_hash?: string;
  summary?: string;
  error?: string;
  validation?: {
    valid: boolean;
    warnings: string[];
    leakage_risks: LeakageRisk[];
    data_readiness: string;
  };
}

export interface PlaybookFromGDMRequest {
  job_id: string;
  use_case: string;
  task?: ProblemType;
  target_table?: string;
  target_column?: string;
  metric?: string;
  time_limit_minutes?: number;
  max_trials?: number;
}

export interface FullResultsRequest {
  include_predictions?: boolean;
  predictions_limit?: number;
  compute_business_metrics?: boolean;
  generate_interpretation?: boolean;
}

// ============================================================================
// AutoML Flow State Types
// ============================================================================

export type AutoMLFlowStep = 'gdm-overview' | 'target-selection' | 'playbook-editor' | 'training' | 'results';

export interface AutoMLFlowState {
  currentStep: AutoMLFlowStep;
  gdmJobId: string | null;
  selectedTarget: {
    table: string;
    column: string;
    task: ProblemType;
  } | null;
  playbook: PlaybookConfig | null;
  playbookValidation: PlaybookValidationResult | null;
  jobId: string | null;
  jobStatus: AutoMLStatusResponse | null;
  results: FullAutoMLResults | null;
  error: string | null;
}

export interface AutoMLFlowActions {
  setStep: (step: AutoMLFlowStep) => void;
  selectTarget: (table: string, column: string, task: ProblemType) => void;
  updatePlaybook: (playbook: Partial<PlaybookConfig>) => void;
  validatePlaybook: () => Promise<PlaybookValidationResult>;
  startTraining: () => Promise<string>;
  pollStatus: (jobId: string) => Promise<AutoMLStatusResponse>;
  fetchResults: (jobId: string) => Promise<FullAutoMLResults>;
  reset: () => void;
}
