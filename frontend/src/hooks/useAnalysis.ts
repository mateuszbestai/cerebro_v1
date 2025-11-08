import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { 
  setResults, 
  setCurrentResult, 
  setAnalyzing, 
  setError 
} from '../store/analysisSlice';
import { apiClient } from '../services/api';
import { AnalysisResult } from '../types';
import { useModelOptions } from '../contexts/ModelContext';

export const useAnalysis = () => {
  const dispatch = useDispatch();
  const { results, currentResult, isAnalyzing, error } = useSelector(
    (state: RootState) => state.analysis
  );
  const { selectedModel } = useModelOptions();

  const runAnalysis = useCallback(
    async (query: string, data?: any) => {
      dispatch(setAnalyzing(true));
      dispatch(setError(undefined));

      try {
        const response = await apiClient.runAnalysis({ query, data, model: selectedModel?.id });
        const analysisId = response.analysis_id;

        // Poll for results
        let attempts = 0;
        const maxAttempts = 30;
        const pollInterval = 2000;

        const pollForResults = async (): Promise<void> => {
          if (attempts >= maxAttempts) {
            throw new Error('Analysis timeout');
          }

          const resultResponse = await apiClient.getAnalysisResults(analysisId);
          
          if (resultResponse.status === 'completed') {
            const result: AnalysisResult = resultResponse.result;
            dispatch(setCurrentResult(result));
            dispatch(setResults([...results, result]));
            return;
          } else if (resultResponse.status === 'failed') {
            throw new Error(resultResponse.error || 'Analysis failed');
          }

          attempts++;
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return pollForResults();
        };

        await pollForResults();
      } catch (err: any) {
        dispatch(setError(err.message || 'Analysis failed'));
      } finally {
        dispatch(setAnalyzing(false));
      }
    },
    [dispatch, results, selectedModel]
  );

  return {
    results,
    currentResult,
    isAnalyzing,
    error,
    runAnalysis,
  };
};
