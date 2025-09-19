import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '../services/api';
import { useDatabase } from '../contexts/DatabaseContext';
import { Message } from '../types';
import { useDispatch } from 'react-redux';
import { addResult } from '../store/analysisSlice';

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  selectedTables: string[];
}

interface ChatContextType {
  currentSessionId: string;
  sessions: ChatSession[];
  messages: Message[];
  isLoading: boolean;
  currentAnalysis: any;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  deleteMessage: (id: string) => void;
  retryLastMessage: () => Promise<void>;
  exportChat: () => void;
  newSession: (title?: string) => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
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
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const raw = localStorage.getItem('chat_sessions');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [{ id: `session_${Date.now()}`, title: 'Chat 1', createdAt: new Date().toISOString(), messages: [], selectedTables: [] }];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => localStorage.getItem('chat_current_session_id') || (sessions[0]?.id || ''));

  const [messages, setMessages] = useState<Message[]>(() => sessions.find(s => s.id === currentSessionId)?.messages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const dispatch = useDispatch();
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const wsConnectionRef = useRef<WebSocket | null>(null);
  const lastMessageRef = useRef<string>('');
  
  const { connectionId, getTableContext, executeQuery, selectedTables, databaseInfo, tables, setSelectedTables } = useDatabase();

  useEffect(() => { localStorage.setItem('chat_sessions', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('chat_current_session_id', currentSessionId); }, [currentSessionId]);
  useEffect(() => {
    const session = sessions.find(s => s.id === currentSessionId);
    setMessages(session?.messages || []);
    if (session) setSelectedTables(session.selectedTables || []);
  }, [currentSessionId, sessions, setSelectedTables]);

  const newSession = useCallback((title?: string) => {
    const id = `session_${Date.now()}`;
    const session: ChatSession = { id, title: title || `Chat ${sessions.length + 1}` , createdAt: new Date().toISOString(), messages: [], selectedTables: selectedTables || [] };
    setSessions(prev => [session, ...prev]);
    setCurrentSessionId(id);
    setCurrentAnalysis(null);
    setError(null);
  }, [sessions.length, selectedTables]);

  const switchSession = useCallback((id: string) => { setCurrentSessionId(id); setCurrentAnalysis(null); setError(null); }, []);
  const renameSession = useCallback((id: string, title: string) => { setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s)); }, []);

  const saveSessionMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    setMessages(prevMsgs => {
      const next = updater(prevMsgs);
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: next, selectedTables } : s));
      return next;
    });
  }, [currentSessionId, selectedTables]);

  const sendMessage = useCallback(async (content: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    lastMessageRef.current = content;

    const userMessage: Message = { id: `msg_${Date.now()}`, role: 'user', content, timestamp: new Date().toISOString(), metadata: { table_context: selectedTables, chat_session_id: currentSessionId } } as any;
    saveSessionMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const context: any = { timestamp: new Date().toISOString(), chat_session_id: currentSessionId };
      if (connectionId) {
        context.database_connection_id = connectionId;
        context.database_context = getTableContext();
        context.selected_tables = selectedTables;
        context.database_name = databaseInfo?.database_name;
        context.tables_count = tables.length;
        context.all_table_names = tables.map(t => t.name);
        const lc = content.toLowerCase();
        if (lc.includes('select') || lc.includes('show') || lc.includes('analyze') || lc.includes('table') || lc.includes('data') || lc.includes('query')) context.likely_sql = true;
      }

      const startTime = Date.now();
      const response = await apiClient.sendChatMessage(content, context, abortControllerRef.current.signal);
      const executionTime = Date.now() - startTime;

      let enrichedAnalysis = response.analysis;
      if (response.analysis?.sql_query && connectionId && !response.analysis?.data) {
        try {
          const queryResult = await executeQuery(response.analysis.sql_query);
          enrichedAnalysis = { ...response.analysis, data: queryResult.data, columns: queryResult.columns, row_count: queryResult.row_count };
        } catch (err: any) {
          console.error('Error executing SQL query:', err);
          enrichedAnalysis = { ...response.analysis, error: err.message };
        }
      }

      const assistantMessage: Message = { id: `msg_${Date.now() + 1}`, role: 'assistant', content: response.response, timestamp: new Date().toISOString(), analysis: enrichedAnalysis, metadata: { sql_query: enrichedAnalysis?.sql_query, execution_time: executionTime, chat_session_id: currentSessionId } } as any;
      saveSessionMessages(prev => [...prev, assistantMessage]);

      if (enrichedAnalysis) {
        setCurrentAnalysis(enrichedAnalysis);
        try {
          dispatch(addResult({ query: content, intent: enrichedAnalysis.intent || { type: 'general' }, response: response.response, data: enrichedAnalysis.data, visualization: enrichedAnalysis.visualization, visualizations: enrichedAnalysis.visualizations, sql_query: enrichedAnalysis.sql_query, columns: enrichedAnalysis.columns, row_count: enrichedAnalysis.row_count, report: enrichedAnalysis.report, statistics: enrichedAnalysis.statistics, timestamp: new Date().toISOString() }));
        } catch (e) { console.warn('Failed to add analysis result to history:', e); }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error occurred';
      setError(errorMessage);
      const errorMsg: Message = { id: `msg_${Date.now() + 1}}`, role: 'assistant', content: `I encountered an error: ${errorMessage}` as string, timestamp: new Date().toISOString(), error: true } as any;
      saveSessionMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [connectionId, getTableContext, executeQuery, selectedTables, databaseInfo, currentSessionId, saveSessionMessages, dispatch, tables]);

  const clearMessages = useCallback(() => { setCurrentAnalysis(null); setError(null); saveSessionMessages(() => []); }, [saveSessionMessages]);
  const deleteMessage = useCallback((id: string) => { saveSessionMessages(prev => prev.filter(msg => msg.id !== id)); }, [saveSessionMessages]);
  const retryLastMessage = useCallback(async () => { if (lastMessageRef.current) await sendMessage(lastMessageRef.current); }, [sendMessage]);

  const exportChat = useCallback(() => {
    const chatData = { exported_at: new Date().toISOString(), session_id: currentSessionId, database_context: { connected: !!connectionId, database_name: databaseInfo?.database_name, selected_tables: selectedTables }, messages: messages.map(msg => ({ role: msg.role, content: msg.content, timestamp: msg.timestamp, metadata: msg.metadata })) };
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `chat_export_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  }, [messages, connectionId, databaseInfo, selectedTables, currentSessionId]);

  const connectWebSocket = useCallback(() => {
    if (wsConnectionRef.current) return;
    wsConnectionRef.current = apiClient.connectWebSocket(
      (data) => {
        if (data.type === 'analysis_update') setCurrentAnalysis(data.analysis);
        else if (data.type === 'message') { const wsMessage: Message = { id: `msg_${Date.now()}`, role: 'assistant', content: data.content, timestamp: new Date().toISOString(), analysis: data.analysis } as any; saveSessionMessages(prev => [...prev, wsMessage]); }
      },
      (error) => { console.error('WebSocket error:', error); setIsConnected(false); },
      () => { setIsConnected(false); wsConnectionRef.current = null; }
    );
    setIsConnected(true);
  }, [saveSessionMessages]);

  const disconnectWebSocket = useCallback(() => { if (wsConnectionRef.current) { apiClient.closeWebSocket(); wsConnectionRef.current = null; setIsConnected(false); } }, []);

  useEffect(() => {
    if (messages.length > 0) return;
    const loadHistory = async () => {
      try {
        const history = await apiClient.getChatHistory(20);
        if (history.messages && history.messages.length > 0) {
          const formatted = history.messages.map(msg => ({ id: msg.id || `msg_${Date.now()}_${Math.random()}`, role: msg.role as 'user' | 'assistant', content: msg.content, timestamp: msg.timestamp, analysis: msg.analysis, metadata: msg.metadata }));
          saveSessionMessages(() => formatted);
        }
      } catch (error) { console.error('Error loading chat history:', error); }
    };
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ChatContext.Provider value={{ currentSessionId, sessions, messages, isLoading, currentAnalysis, error, sendMessage, clearMessages, deleteMessage, retryLastMessage, exportChat, newSession, switchSession, renameSession, isConnected, connectWebSocket, disconnectWebSocket }}>
      {children}
    </ChatContext.Provider>
  );
};
