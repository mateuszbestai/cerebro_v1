/**
 * Forecast TypeScript Types
 *
 * Types for the GPT-5 powered forecasting and business intelligence features.
 */

export type ForecastType = 'timeseries' | 'insights' | 'both';

export interface ForecastPrediction {
  date: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

export interface TimeSeriesForecast {
  predictions: ForecastPrediction[];
  chart_data: PlotlyChartData;
  summary: {
    trend: 'increasing' | 'decreasing' | 'stable';
    average_value: number;
    min_value: number;
    max_value: number;
    confidence_level: number;
  };
}

export interface PlotlyChartData {
  data: any[];
  layout: any;
  config?: any;
}

export interface KeyDriver {
  factor: string;
  impact: string;
  impact_score: number;
  recommendation: string;
}

export interface WhatIfScenario {
  scenario: string;
  outcome: string;
  confidence: number;
  impact_direction: 'positive' | 'negative' | 'neutral';
}

export interface BusinessInsights {
  executive_summary: string;
  key_drivers: KeyDriver[];
  what_if_scenarios: WhatIfScenario[];
  strategic_recommendations: string[];
  risks_and_caveats: string[];
  confidence_score: number;
}

export interface ForecastResult {
  job_id: string;
  automl_job_id: string;
  forecast_type: ForecastType;
  timeseries_forecast: TimeSeriesForecast | null;
  business_insights: BusinessInsights;
  narrative: string;
  generated_at: string;
  model_used: string;
}

export interface ForecastRequest {
  automl_job_id: string;
  forecast_type: ForecastType;
  forecast_horizon?: number;
  time_column?: string;
  context?: string;
}

export interface ForecastStatusResponse {
  job_id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress_pct: number;
  message: string;
  result?: ForecastResult;
  error?: string;
}

// Chart display types
export interface FeatureImportanceData {
  features: string[];
  importances: number[];
}

export interface ConfusionMatrixData {
  matrix: number[][];
  labels: string[];
}

// Combined results for the AI Forecasts panel
export interface AIForecastsPanelData {
  automlResults: {
    job_id: string;
    task: string;
    target_column: string;
    best_model: string;
    best_score: number;
    eval_metric: string;
    training_time_seconds: number;
    num_rows_train: number;
    num_features: number;
    feature_importance: Record<string, number>;
    leaderboard: Array<{
      model: string;
      score_val: number;
      fit_time?: number;
      pred_time_val?: number;
    }>;
    confusion_matrix?: number[][];
    class_labels?: string[];
    insights?: {
      executive_summary: string;
      accuracy_explanation: string;
      key_insights: Array<{
        feature: string;
        insight: string;
        business_action: string;
      }>;
      recommendation: string;
      caveats: string[];
    };
  } | null;
  forecast: ForecastResult | null;
  isLoading: boolean;
  error: string | null;
}
