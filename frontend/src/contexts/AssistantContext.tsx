/**
 * AssistantContext - Unified State for Database Assistant
 *
 * Manages state for:
 * - GDM job context
 * - AutoML job context and status
 * - Forecast results
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// Re-export types from forecast.ts for consistency
export type {
  ForecastResult,
  ForecastPrediction,
  KeyDriver,
  WhatIfScenario,
  BusinessInsights,
  TimeSeriesForecast,
  ForecastType,
  PlotlyChartData,
} from '../types/forecast';

import type { ForecastResult } from '../types/forecast';

// Local types
export type AutoMLStatus = 'idle' | 'training' | 'completed' | 'failed';

export interface AssistantState {
  gdmJobId: string | null;
  automlJobId: string | null;
  automlStatus: AutoMLStatus;
  forecastData: ForecastResult | null;
  isLoadingForecast: boolean;
}

export interface AssistantContextValue extends AssistantState {
  setGdmJobId: (jobId: string | null) => void;
  setAutomlJobId: (jobId: string | null) => void;
  setAutomlStatus: (status: AutoMLStatus) => void;
  setForecastData: (data: ForecastResult | null) => void;
  setIsLoadingForecast: (loading: boolean) => void;
  resetAutoMLState: () => void;
}

// Storage keys
const STORAGE_KEYS = {
  LAST_GDM_JOB: 'cerebro_last_gdm_job_id',
  LAST_AUTOML_JOB: 'cerebro_last_automl_job_id',
};

// Create context
const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

// Provider component
interface AssistantProviderProps {
  children: ReactNode;
}

export const AssistantProvider: React.FC<AssistantProviderProps> = ({ children }) => {
  // Initialize state from localStorage where applicable
  const [gdmJobId, setGdmJobIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.LAST_GDM_JOB);
  });

  const [automlJobId, setAutomlJobIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.LAST_AUTOML_JOB);
  });

  const [automlStatus, setAutomlStatus] = useState<AutoMLStatus>('idle');
  const [forecastData, setForecastData] = useState<ForecastResult | null>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);

  // GDM job ID setter with persistence
  const setGdmJobId = useCallback((jobId: string | null) => {
    setGdmJobIdState(jobId);
    if (jobId) {
      localStorage.setItem(STORAGE_KEYS.LAST_GDM_JOB, jobId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.LAST_GDM_JOB);
    }
  }, []);

  // AutoML job ID setter with persistence
  const setAutomlJobId = useCallback((jobId: string | null) => {
    setAutomlJobIdState(jobId);
    if (jobId) {
      localStorage.setItem(STORAGE_KEYS.LAST_AUTOML_JOB, jobId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.LAST_AUTOML_JOB);
    }
  }, []);

  // Reset AutoML state for starting fresh
  const resetAutoMLState = useCallback(() => {
    setAutomlJobId(null);
    setAutomlStatus('idle');
    setForecastData(null);
    setIsLoadingForecast(false);
  }, [setAutomlJobId]);

  // Sync automlStatus when jobId changes
  useEffect(() => {
    if (!automlJobId) {
      setAutomlStatus('idle');
    }
  }, [automlJobId]);

  const value: AssistantContextValue = {
    gdmJobId,
    automlJobId,
    automlStatus,
    forecastData,
    isLoadingForecast,
    setGdmJobId,
    setAutomlJobId,
    setAutomlStatus,
    setForecastData,
    setIsLoadingForecast,
    resetAutoMLState,
  };

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
};

// Hook for consuming context
export const useAssistant = (): AssistantContextValue => {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
};

export default AssistantContext;
