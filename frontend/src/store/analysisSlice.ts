import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AnalysisResult, AnalysisState } from '../types';

const initialState: AnalysisState = {
  results: [],
  currentResult: undefined,
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
      state.results.push(action.payload);
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
  },
});

export const {
  setResults,
  addResult,
  setCurrentResult,
  setAnalyzing,
  setError,
  clearResults,
} = analysisSlice.actions;

export default analysisSlice.reducer;