/**
 * AssistantContext - Unified State for Database Assistant Tabs
 *
 * Manages state for:
 * - Active tab navigation (chat, automl, forecasts)
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
export type AssistantTab = 'chat' | 'automl' | 'forecasts';
export type AutoMLStatus = 'idle' | 'training' | 'completed' | 'failed';

export interface AssistantState {
  activeTab: AssistantTab;
  gdmJobId: string | null;
  automlJobId: string | null;
  automlStatus: AutoMLStatus;
  forecastData: ForecastResult | null;
  isLoadingForecast: boolean;
}

export interface AssistantContextValue extends AssistantState {
  setActiveTab: (tab: AssistantTab) => void;
  setGdmJobId: (jobId: string | null) => void;
  setAutomlJobId: (jobId: string | null) => void;
  setAutomlStatus: (status: AutoMLStatus) => void;
  setForecastData: (data: ForecastResult | null) => void;
  setIsLoadingForecast: (loading: boolean) => void;
  navigateToAutoML: (gdmJobId?: string) => void;
  navigateToForecasts: (automlJobId?: string) => void;
  resetAutoMLState: () => void;
}

// Storage keys
const STORAGE_KEYS = {
  LAST_GDM_JOB: 'cerebro_last_gdm_job_id',
  LAST_AUTOML_JOB: 'cerebro_last_automl_job_id',
  ACTIVE_TAB: 'cerebro_assistant_active_tab',
};

// Create context
const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

// Provider component
interface AssistantProviderProps {
  children: ReactNode;
}

export const AssistantProvider: React.FC<AssistantProviderProps> = ({ children }) => {
  // Initialize state from localStorage where applicable
  const [activeTab, setActiveTabState] = useState<AssistantTab>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
    return (saved as AssistantTab) || 'chat';
  });

  const [gdmJobId, setGdmJobIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.LAST_GDM_JOB);
  });

  const [automlJobId, setAutomlJobIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.LAST_AUTOML_JOB);
  });

  const [automlStatus, setAutomlStatus] = useState<AutoMLStatus>('idle');
  const [forecastData, setForecastData] = useState<ForecastResult | null>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);

  // Tab setter with persistence
  const setActiveTab = useCallback((tab: AssistantTab) => {
    setActiveTabState(tab);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tab);
  }, []);

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

  // Navigate to AutoML tab with optional GDM context
  const navigateToAutoML = useCallback((gdmId?: string) => {
    if (gdmId) {
      setGdmJobId(gdmId);
    }
    setActiveTab('automl');
  }, [setGdmJobId, setActiveTab]);

  // Navigate to Forecasts tab with optional AutoML job
  const navigateToForecasts = useCallback((automlId?: string) => {
    if (automlId) {
      setAutomlJobId(automlId);
    }
    setActiveTab('forecasts');
  }, [setAutomlJobId, setActiveTab]);

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
    activeTab,
    gdmJobId,
    automlJobId,
    automlStatus,
    forecastData,
    isLoadingForecast,
    setActiveTab,
    setGdmJobId,
    setAutomlJobId,
    setAutomlStatus,
    setForecastData,
    setIsLoadingForecast,
    navigateToAutoML,
    navigateToForecasts,
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
