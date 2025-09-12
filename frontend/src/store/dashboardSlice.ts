import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DashboardChart {
  id: string;
  title: string;
  data: string; // JSON string
  type: string;
  config?: any;
  source: 'chat' | 'analysis' | 'manual';
  timestamp: string;
  metadata?: {
    query?: string;
    description?: string;
  };
}

export interface DashboardState {
  charts: DashboardChart[];
  layout: 'grid' | 'list' | 'dashboard';
  selectedChartId?: string;
}

const initialState: DashboardState = {
  charts: [],
  layout: 'grid',
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    addChart: (state, action: PayloadAction<DashboardChart>) => {
      state.charts.push(action.payload);
    },
    addMultipleCharts: (state, action: PayloadAction<DashboardChart[]>) => {
      state.charts.push(...action.payload);
    },
    removeChart: (state, action: PayloadAction<string>) => {
      state.charts = state.charts.filter(chart => chart.id !== action.payload);
    },
    updateChart: (state, action: PayloadAction<DashboardChart>) => {
      const index = state.charts.findIndex(chart => chart.id === action.payload.id);
      if (index !== -1) {
        state.charts[index] = action.payload;
      }
    },
    clearDashboard: (state) => {
      state.charts = [];
      state.selectedChartId = undefined;
    },
    setLayout: (state, action: PayloadAction<'grid' | 'list' | 'dashboard'>) => {
      state.layout = action.payload;
    },
    selectChart: (state, action: PayloadAction<string | undefined>) => {
      state.selectedChartId = action.payload;
    },
    reorderCharts: (state, action: PayloadAction<string[]>) => {
      const newOrder = action.payload;
      const chartsMap = new Map(state.charts.map(chart => [chart.id, chart]));
      state.charts = newOrder.map(id => chartsMap.get(id)!).filter(Boolean);
    },
  },
});

export const {
  addChart,
  addMultipleCharts,
  removeChart,
  updateChart,
  clearDashboard,
  setLayout,
  selectChart,
  reorderCharts,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;
