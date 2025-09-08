import { useState, useCallback } from 'react';
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

export const useAnalysis = () => {
  const dispatch = useDispatch();
  const { results, currentResult, isAnalyzing, error } = useSelector(
    (state: RootState) => state.analysis
  );

  const runAnalysis = useCallback(
    async (query: string, data?: any) => {
      dispatch(setAnalyzing(true));
      dispatch(setError(undefined));

      try {
        const response = await apiClient.runAnalysis(query, data);
        const analysisId = response.data.analysis_id;

        // Poll for results
        let attempts = 0;
        const maxAttempts = 30;
        const pollInterval = 2000;

        const pollForResults = async () => {
          if (attempts >= maxAttempts) {
            throw new Error('Analysis timeout');
          }

          const resultResponse = await apiClient.getAnalysisResults(analysisId);
          
          if (resultResponse.data.status === 'completed') {
            const result: AnalysisResult = resultResponse.data.result;
            dispatch(setCurrentResult(result));
            dispatch(setResults([...results, result]));
            return;
          } else if (resultResponse.data.status === 'failed') {
            throw new Error(resultResponse.data.error || 'Analysis failed');
          }

          attempts++;
          setTimeout(pollForResults, pollInterval);
        };

        await pollForResults();
      } catch (err: any) {
        dispatch(setError(err.message || 'Analysis failed'));
      } finally {
        dispatch(setAnalyzing(false));
      }
    },
    [dispatch, results]
  );

  return {
    results,
    currentResult,
    isAnalyzing,
    error,
    runAnalysis,
  };
};