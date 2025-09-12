import { configureStore } from '@reduxjs/toolkit';
import chatReducer from './chatSlice';
import analysisReducer from './analysisSlice';
import dashboardReducer from './dashboardSlice';
import { loadState, saveState } from './persist';
import { AnalysisState } from '../types';

const persisted = loadState();

const preloadedAnalysis: AnalysisState | undefined = (() => {
  const history = persisted?.analysis?.history || [];
  return {
    results: [],
    history,
    currentResult: history.length > 0 ? history[0] : undefined,
    currentHistoryIndex: history.length > 0 ? 0 : -1,
    isAnalyzing: false,
    error: undefined,
  };
})();

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    analysis: analysisReducer,
    dashboard: dashboardReducer,
  },
  preloadedState: persisted ? {
    analysis: preloadedAnalysis as AnalysisState,
    dashboard: { ...(persisted.dashboard || { charts: [], layout: 'grid' }) },
  } : undefined,
});

// Persist selected slices
store.subscribe(() => {
  const state = store.getState();
  saveState({
    analysis: { history: state.analysis.history },
    dashboard: { charts: state.dashboard.charts, layout: state.dashboard.layout },
  });
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
