import { useState, useEffect, useCallback } from 'react';
import { databaseApi, ConnectionRequest, TableInfo, DatabaseInfo } from '../services/databaseApi';

interface DatabaseState {
  connectionId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  databaseInfo: DatabaseInfo | null;
  tables: TableInfo[];
  selectedTables: string[];
}

interface UseDatabaseReturn extends DatabaseState {
  connect: (params: ConnectionRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  setSelectedTables: (tables: string[]) => void;
  refreshTables: () => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
  getTableContext: () => string;
}

const initialState: DatabaseState = {
  connectionId: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  databaseInfo: null,
  tables: [],
  selectedTables: [],
};

export function useDatabase(): UseDatabaseReturn {
  const [state, setState] = useState<DatabaseState>(initialState);

  // Load saved connection from localStorage on mount
  useEffect(() => {
    const savedConnectionId = localStorage.getItem('database_connection_id');
    if (savedConnectionId) {
      checkConnection(savedConnectionId);
    }
  }, []);

  const checkConnection = async (connectionId: string) => {
    try {
      // Try to get database info to verify connection is still active
      const info = await databaseApi.getDatabaseInfo(connectionId);
      const tablesResponse = await databaseApi.getTables(connectionId);
      
      setState(prev => ({
        ...prev,
        connectionId,
        isConnected: true,
        databaseInfo: info,
        tables: tablesResponse.tables,
      }));
    } catch (error) {
      // Connection is no longer valid
      localStorage.removeItem('database_connection_id');
      setState(initialState);
    }
  };

  const connect = useCallback(async (params: ConnectionRequest) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const response = await databaseApi.connect(params);
      
      if (response.status === 'connected') {
        // Save connection ID to localStorage
        localStorage.setItem('database_connection_id', response.connection_id);
        
        // Get database info and tables
        const [info, tablesResponse] = await Promise.all([
          databaseApi.getDatabaseInfo(response.connection_id),
          databaseApi.getTables(response.connection_id),
        ]);

        setState({
          connectionId: response.connection_id,
          isConnected: true,
          isConnecting: false,
          error: null,
          databaseInfo: info,
          tables: tablesResponse.tables,
          selectedTables: [],
        });
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      const errorMessage = databaseApi.parseSQLError(error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!state.connectionId) return;

    try {
      await databaseApi.disconnect(state.connectionId);
      localStorage.removeItem('database_connection_id');
      setState(initialState);
    } catch (error) {
      console.error('Error disconnecting:', error);
      // Still reset state even if disconnect fails
      localStorage.removeItem('database_connection_id');
      setState(initialState);
    }
  }, [state.connectionId]);

  const setSelectedTables = useCallback((tables: string[]) => {
    setState(prev => ({ ...prev, selectedTables: tables }));
  }, []);

  const refreshTables = useCallback(async () => {
    if (!state.connectionId) return;

    try {
      const tablesResponse = await databaseApi.getTables(state.connectionId);
      setState(prev => ({
        ...prev,
        tables: tablesResponse.tables,
      }));
    } catch (error) {
      console.error('Error refreshing tables:', error);
    }
  }, [state.connectionId]);

  const executeQuery = useCallback(async (query: string) => {
    if (!state.connectionId) {
      throw new Error('No database connection');
    }

    return await databaseApi.executeQuery(state.connectionId, query);
  }, [state.connectionId]);

  const getTableContext = useCallback((): string => {
    if (!state.isConnected || !state.databaseInfo) {
      return '';
    }

    let context = `Connected to database: ${state.databaseInfo.database_name}\n`;
    
    if (state.selectedTables.length > 0) {
      context += `Selected tables for analysis: ${state.selectedTables.join(', ')}\n`;
      
      // Add table details for selected tables
      state.selectedTables.forEach(tableName => {
        const table = state.tables.find(t => t.name === tableName);
        if (table) {
          context += `- ${tableName}: ${table.columns_count} columns, ${table.row_count || 'unknown'} rows\n`;
        }
      });
    } else {
      context += `Available tables: ${state.tables.map(t => t.name).join(', ')}\n`;
    }

    return context;
  }, [state]);

  return {
    ...state,
    connect,
    disconnect,
    setSelectedTables,
    refreshTables,
    executeQuery,
    getTableContext,
  };
}