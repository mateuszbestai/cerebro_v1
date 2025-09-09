import { useState, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import { useDatabase } from './useDatabase';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
  analysis?: any;
}

interface ChatHookReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (message: string) => Promise<void>;
  currentAnalysis: any;
  clearMessages: () => void;
}

export function useChat(): ChatHookReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Get database context
  const { connectionId, getTableContext, executeQuery } = useDatabase();

  const sendMessage = useCallback(async (content: string) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Build context for the backend
      const context: any = {};
      
      // Add database context if connected
      if (connectionId) {
        context.database_connection_id = connectionId;
        context.database_context = getTableContext();
        
        // If the message looks like a SQL query, add that info
        if (content.toLowerCase().includes('select') || 
            content.toLowerCase().includes('table') ||
            content.toLowerCase().includes('analyze') ||
            content.toLowerCase().includes('show')) {
          context.query_type = 'sql';
        }
      }

      // Send message to backend
      const response = await apiClient.sendChatMessage(
        content,
        context,
        abortControllerRef.current.signal
      );

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        analysis: response.analysis,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update current analysis if present
      if (response.analysis) {
        setCurrentAnalysis(response.analysis);
        
        // If there's SQL query result, we might want to execute it
        if (response.analysis.query && connectionId) {
          try {
            const queryResult = await executeQuery(response.analysis.query);
            // Update the analysis with actual results
            setCurrentAnalysis(prev => ({
              ...prev,
              data: queryResult.data,
              columns: queryResult.columns,
              row_count: queryResult.row_count,
            }));
          } catch (error) {
            console.error('Error executing query:', error);
          }
        }
      }
    } catch (error: any) {
      // Don't show error if request was aborted
      if (error.name === 'AbortError') {
        return;
      }

      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message || 'Unknown error occurred'}`,
        timestamp: new Date(),
        error: true,
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [connectionId, getTableContext, executeQuery]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentAnalysis(null);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    currentAnalysis,
    clearMessages,
  };
}