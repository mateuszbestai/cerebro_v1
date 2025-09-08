import { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addMessage, setLoading, setAnalysis } from '../store/chatSlice';
import { apiClient } from '../services/api';
import { Message, AnalysisResult } from '../types';
import { useWebSocket } from './useWebSocket';

export const useChat = () => {
  const dispatch = useDispatch();
  const { messages, isLoading, currentAnalysis } = useSelector(
    (state: RootState) => state.chat
  );

  const { sendMessage: wsSend, lastMessage } = useWebSocket(
    process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws'
  );

  const sendMessage = useCallback(
    async (content: string) => {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content,
        role: 'user',
        timestamp: new Date().toISOString(),
      };
      dispatch(addMessage(userMessage));
      dispatch(setLoading(true));

      try {
        // Send to backend
        const response = await apiClient.post('/chat/message', {
          message: content,
          context: currentAnalysis,
        });

        // Add AI response
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response.data.response,
          role: 'assistant',
          timestamp: new Date().toISOString(),
        };
        dispatch(addMessage(aiMessage));

        // Update analysis if present
        if (response.data.analysis) {
          dispatch(setAnalysis(response.data.analysis));
        }
      } catch (error) {
        console.error('Error sending message:', error);
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: 'Sorry, an error occurred while processing your request.',
          role: 'assistant',
          timestamp: new Date().toISOString(),
          error: true,
        };
        dispatch(addMessage(errorMessage));
      } finally {
        dispatch(setLoading(false));
      }
    },
    [dispatch, currentAnalysis]
  );

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      
      if (data.type === 'analysis_update') {
        dispatch(setAnalysis(data.analysis));
      } else if (data.type === 'message') {
        dispatch(addMessage(data.message));
      }
    }
  }, [lastMessage, dispatch]);

  return {
    messages,
    isLoading,
    sendMessage,
    currentAnalysis,
  };
};
