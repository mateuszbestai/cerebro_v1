import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AnalysisResult, AnalysisState } from '../types';

const MAX_HISTORY_ITEMS = 50;

const initialState: AnalysisState = {
  results: [],
  history: [],
  currentResult: undefined,
  currentHistoryIndex: -1,
  isAnalyzing: false,
  error: undefined,
};

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setResults: (state, action: PayloadAction<AnalysisResult[]>) => {
      state.results = action.payload;
    },
    addResult: (state, action: PayloadAction<AnalysisResult>) => {
      const resultWithTimestamp = {
        ...action.payload,
        timestamp: action.payload.timestamp || new Date().toISOString(),
      };
      state.results.push(resultWithTimestamp);
      // Add to history
      state.history.unshift(resultWithTimestamp);
      // Keep history size limited
      if (state.history.length > MAX_HISTORY_ITEMS) {
        state.history = state.history.slice(0, MAX_HISTORY_ITEMS);
      }
      state.currentHistoryIndex = 0;
    },
    setCurrentResult: (state, action: PayloadAction<AnalysisResult | undefined>) => {
      state.currentResult = action.payload;
    },
    setAnalyzing: (state, action: PayloadAction<boolean>) => {
      state.isAnalyzing = action.payload;
    },
    setError: (state, action: PayloadAction<string | undefined>) => {
      state.error = action.payload;
    },
    clearResults: (state) => {
      state.results = [];
      state.currentResult = undefined;
      state.error = undefined;
    },
    navigateHistory: (state, action: PayloadAction<'prev' | 'next'>) => {
      if (action.payload === 'prev' && state.currentHistoryIndex < state.history.length - 1) {
        state.currentHistoryIndex++;
        state.currentResult = state.history[state.currentHistoryIndex];
      } else if (action.payload === 'next' && state.currentHistoryIndex > 0) {
        state.currentHistoryIndex--;
        state.currentResult = state.history[state.currentHistoryIndex];
      }
    },
    selectFromHistory: (state, action: PayloadAction<number>) => {
      const index = action.payload;
      if (index >= 0 && index < state.history.length) {
        state.currentHistoryIndex = index;
        state.currentResult = state.history[index];
      }
    },
    clearHistory: (state) => {
      state.history = [];
      state.currentHistoryIndex = -1;
    },
  },
});

export const {
  setResults,
  addResult,
  setCurrentResult,
  setAnalyzing,
  setError,
  clearResults,
  navigateHistory,
  selectFromHistory,
  clearHistory,
} = analysisSlice.actions;

export default analysisSlice.reducer;