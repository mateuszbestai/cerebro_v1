import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import { useDatabase } from '../hooks/useDatabase';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  error?: boolean;
  analysis?: any;
  metadata?: {
    sql_query?: string;
    table_context?: string[];
    execution_time?: number;
  };
}

interface ChatContextType {
  // State
  messages: Message[];
  isLoading: boolean;
  currentAnalysis: any;
  error: string | null;
  
  // Actions
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  deleteMessage: (id: string) => void;
  retryLastMessage: () => Promise<void>;
  exportChat: () => void;
  
  // WebSocket
  isConnected: boolean;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

interface ChatProviderProps {
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const wsConnectionRef = useRef<WebSocket | null>(null);
  const lastMessageRef = useRef<string>('');
  
  // Get database context
  const { 
    connectionId, 
    getTableContext, 
    executeQuery,
    selectedTables,
    databaseInfo 
  } = useDatabase();

  const sendMessage = useCallback(async (content: string) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    // Store for retry
    lastMessageRef.current = content;

    // Add user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      metadata: {
        table_context: selectedTables,
      }
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Build context
      const context: any = {
        timestamp: new Date().toISOString(),
      };
      
      // Add database context if connected
      if (connectionId) {
        context.database_connection_id = connectionId;
        context.database_context = getTableContext();
        context.selected_tables = selectedTables;
        context.database_name = databaseInfo?.database_name;
        
        // Detect query intent
        const lowerContent = content.toLowerCase();
        if (
          lowerContent.includes('select') || 
          lowerContent.includes('show') ||
          lowerContent.includes('analyze') ||
          lowerContent.includes('table') ||
          lowerContent.includes('data') ||
          lowerContent.includes('query')
        ) {
          context.likely_sql = true;
        }
      }

      // Send to backend
      const startTime = Date.now();
      const response = await apiClient.sendChatMessage(
        content,
        context,
        abortControllerRef.current.signal
      );
      const executionTime = Date.now() - startTime;

      // Process analysis if SQL query was executed
      let enrichedAnalysis = response.analysis;
      if (response.analysis?.sql_query && connectionId && !response.analysis?.data) {
        try {
          // Execute the SQL query to get actual results
          const queryResult = await executeQuery(response.analysis.sql_query);
          enrichedAnalysis = {
            ...response.analysis,
            data: queryResult.data,
            columns: queryResult.columns,
            row_count: queryResult.row_count,
          };
        } catch (queryError: any) {
          console.error('Error executing SQL query:', queryError);
          enrichedAnalysis = {
            ...response.analysis,
            error: queryError.message,
          };
        }
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        analysis: enrichedAnalysis,
        metadata: {
          sql_query: enrichedAnalysis?.sql_query,
          execution_time: executionTime,
        }
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update current analysis
      if (enrichedAnalysis) {
        setCurrentAnalysis(enrichedAnalysis);
      }
      
    } catch (error: any) {
      // Don't show error if request was aborted
      if (error.name === 'AbortError') {
        return;
      }

      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error occurred';
      setError(errorMessage);

      // Add error message
      const errorMsg: Message = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: `I encountered an error: ${errorMessage}`,
        timestamp: new Date(),
        error: true,
      };

      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [connectionId, getTableContext, executeQuery, selectedTables, databaseInfo]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentAnalysis(null);
    setError(null);
  }, []);

  const deleteMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (lastMessageRef.current) {
      await sendMessage(lastMessageRef.current);
    }
  }, [sendMessage]);

  const exportChat = useCallback(() => {
    const chatData = {
      exported_at: new Date().toISOString(),
      database_context: {
        connected: !!connectionId,
        database_name: databaseInfo?.database_name,
        selected_tables: selectedTables,
      },
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: msg.metadata,
      })),
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, connectionId, databaseInfo, selectedTables]);

  const connectWebSocket = useCallback(() => {
    if (wsConnectionRef.current) {
      return;
    }

    wsConnectionRef.current = apiClient.connectWebSocket(
      (data) => {
        // Handle incoming WebSocket messages
        if (data.type === 'analysis_update') {
          setCurrentAnalysis(data.analysis);
        } else if (data.type === 'message') {
          const wsMessage: Message = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            timestamp: new Date(),
            analysis: data.analysis,
          };
          setMessages(prev => [...prev, wsMessage]);
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      },
      () => {
        setIsConnected(false);
        wsConnectionRef.current = null;
      }
    );

    setIsConnected(true);
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsConnectionRef.current) {
      apiClient.closeWebSocket();
      wsConnectionRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Load chat history on mount
  React.useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await apiClient.getChatHistory(20);
        if (history.messages && history.messages.length > 0) {
          const formattedMessages = history.messages.map(msg => ({
            id: msg.id || `msg_${Date.now()}_${Math.random()}`,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            analysis: msg.analysis,
            metadata: msg.metadata,
          }));
          setMessages(formattedMessages);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      }
    };

    // Uncomment to load history on mount
    // loadHistory();
  }, []);

  const value: ChatContextType = {
    messages,
    isLoading,
    currentAnalysis,
    error,
    sendMessage,
    clearMessages,
    deleteMessage,
    retryLastMessage,
    exportChat,
    isConnected,
    connectWebSocket,
    disconnectWebSocket,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};