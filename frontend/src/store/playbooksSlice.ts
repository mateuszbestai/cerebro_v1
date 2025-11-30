import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AutoMLJobStatus, Playbook } from '../types';

interface PlaybooksState {
  playbooks: Playbook[];
  loading: boolean;
  error?: string;
  selectedPlaybook?: Playbook;
  activeJobId?: string;
  jobStatus?: AutoMLJobStatus;
}

const initialState: PlaybooksState = {
  playbooks: [],
  loading: false,
  error: undefined,
  selectedPlaybook: undefined,
  activeJobId: undefined,
  jobStatus: undefined,
};

const playbooksSlice = createSlice({
  name: 'playbooks',
  initialState,
  reducers: {
    setPlaybooks: (state, action: PayloadAction<Playbook[]>) => {
      state.playbooks = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | undefined>) => {
      state.error = action.payload;
    },
    setSelectedPlaybook: (state, action: PayloadAction<Playbook | undefined>) => {
      state.selectedPlaybook = action.payload;
    },
    setActiveJob: (state, action: PayloadAction<string | undefined>) => {
      state.activeJobId = action.payload;
    },
    setJobStatus: (state, action: PayloadAction<AutoMLJobStatus | undefined>) => {
      state.jobStatus = action.payload;
    },
    clearJob: (state) => {
      state.activeJobId = undefined;
      state.jobStatus = undefined;
    },
  },
});

export const {
  setPlaybooks,
  setLoading,
  setError,
  setSelectedPlaybook,
  setActiveJob,
  setJobStatus,
  clearJob,
} = playbooksSlice.actions;

export default playbooksSlice.reducer;
