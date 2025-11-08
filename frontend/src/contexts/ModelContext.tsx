import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient, ModelOption } from '../services/api';

interface ModelContextValue {
  models: ModelOption[];
  selectedModel: ModelOption | null;
  selectModel: (modelId: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshModels: () => void;
}

const ModelContext = createContext<ModelContextValue | undefined>(undefined);

const STORAGE_KEY = 'cerebro_model_id';

export const ModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getAvailableModels();
      setModels(response.models || []);
      if (response.models && response.models.length > 0) {
        const incomingDefault = response.models.find(model => model.default);
        const desiredId = selectedModelId && response.models.some(m => m.id === selectedModelId)
          ? selectedModelId
          : (incomingDefault?.id || response.models[0]?.id || null);
        if (desiredId) {
          setSelectedModelId(desiredId);
          localStorage.setItem(STORAGE_KEY, desiredId);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load model list');
    } finally {
      setIsLoading(false);
    }
  }, [selectedModelId]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const selectModel = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem(STORAGE_KEY, modelId);
  }, []);

  const selectedModel = models.find(model => model.id === selectedModelId) || null;

  const value: ModelContextValue = {
    models,
    selectedModel,
    selectModel,
    isLoading,
    error,
    refreshModels: fetchModels,
  };

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
};

export const useModelOptions = (): ModelContextValue => {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error('useModelOptions must be used within a ModelProvider');
  }
  return context;
};
