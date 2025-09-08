import { configureStore } from '@reduxjs/toolkit';
import chatReducer from './chatSlice';
import analysisReducer from './analysisSlice';

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    analysis: analysisReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;