import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Message, AnalysisResult, ChatState } from '../types';

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  currentAnalysis: undefined,
  error: undefined,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
    },
    clearMessages: (state) => {
      state.messages = [];
      state.currentAnalysis = undefined;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setAnalysis: (state, action: PayloadAction<AnalysisResult>) => {
      state.currentAnalysis = action.payload;
    },
    setError: (state, action: PayloadAction<string | undefined>) => {
      state.error = action.payload;
    },
  },
});

export const { addMessage, clearMessages, setLoading, setAnalysis, setError } = 
  chatSlice.actions;
export default chatSlice.reducer;