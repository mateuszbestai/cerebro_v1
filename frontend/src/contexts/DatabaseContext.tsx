import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { databaseApi, ConnectionRequest, TableInfo, DatabaseInfo } from '../services/databaseApi';

interface DatabaseContextType {
  // State
  connectionId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  databaseInfo: DatabaseInfo | null;
  tables: TableInfo[];
  selectedTables: string[];
  
  // Actions
  connect: (params: ConnectionRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  setSelectedTables: (tables: string[]) => void;
  refreshTables: () => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
  getTableContext: () => string;
  clearError: () => void;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

interface DatabaseProviderProps {
  children: React.ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databaseInfo, setDatabaseInfo] = useState<DatabaseInfo | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  // Load saved connection from localStorage on mount
  useEffect(() => {
    const savedConnectionId = localStorage.getItem('database_connection_id');
    const savedSelectedTables = localStorage.getItem('database_selected_tables');
    
    if (savedConnectionId) {
      checkConnection(savedConnectionId);
    }
    
    if (savedSelectedTables) {
      try {
        setSelectedTables(JSON.parse(savedSelectedTables));
      } catch (e) {
        console.error('Error parsing saved selected tables');
      }
    }
  }, []);

  // Save selected tables to localStorage when they change
  useEffect(() => {
    if (selectedTables.length > 0) {
      localStorage.setItem('database_selected_tables', JSON.stringify(selectedTables));
    } else {
      localStorage.removeItem('database_selected_tables');
    }
  }, [selectedTables]);

  const checkConnection = async (connectionId: string) => {
    try {
      // Try to get database info to verify connection is still active
      const info = await databaseApi.getDatabaseInfo(connectionId);
      const tablesResponse = await databaseApi.getTables(connectionId);
      
      setConnectionId(connectionId);
      setIsConnected(true);
      setDatabaseInfo(info);
      setTables(tablesResponse.tables);
    } catch (error) {
      // Connection is no longer valid
      localStorage.removeItem('database_connection_id');
      localStorage.removeItem('database_selected_tables');
      resetState();
    }
  };

  const resetState = () => {
    setConnectionId(null);
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    setDatabaseInfo(null);
    setTables([]);
    setSelectedTables([]);
  };

  const connect = useCallback(async (params: ConnectionRequest) => {
    setIsConnecting(true);
    setError(null);

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

        setConnectionId(response.connection_id);
        setIsConnected(true);
        setDatabaseInfo(info);
        setTables(tablesResponse.tables);
        setSelectedTables([]);
        setError(null);
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      const errorMessage = databaseApi.parseSQLError(error);
      setError(errorMessage);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!connectionId) return;

    try {
      await databaseApi.disconnect(connectionId);
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      // Always reset state
      localStorage.removeItem('database_connection_id');
      localStorage.removeItem('database_selected_tables');
      resetState();
    }
  }, [connectionId]);

  const refreshTables = useCallback(async () => {
    if (!connectionId) return;

    try {
      const tablesResponse = await databaseApi.getTables(connectionId);
      setTables(tablesResponse.tables);
    } catch (error: any) {
      console.error('Error refreshing tables:', error);
      setError('Failed to refresh tables');
    }
  }, [connectionId]);

  const executeQuery = useCallback(async (query: string) => {
    if (!connectionId) {
      throw new Error('No database connection');
    }

    return await databaseApi.executeQuery(connectionId, query);
  }, [connectionId]);

  const getTableContext = useCallback((): string => {
    if (!isConnected || !databaseInfo) {
      return '';
    }

    let context = `Connected to database: ${databaseInfo.database_name}\n`;
    context += `Server: ${databaseInfo.server_version.split(' ')[0]}\n`;
    
    if (selectedTables.length > 0) {
      context += `\nSelected tables for analysis:\n`;
      
      // Add table details for selected tables
      selectedTables.forEach(tableName => {
        const table = tables.find(t => t.name === tableName);
        if (table) {
          context += `- ${tableName}: ${table.columns_count} columns, ${table.row_count || 'unknown'} rows\n`;
        }
      });
      
      context += '\nFocus your analysis on these selected tables unless otherwise specified.';
    } else {
      context += `\nAvailable tables (${tables.length} total):\n`;
      // List first 10 tables
      tables.slice(0, 10).forEach(table => {
        context += `- ${table.name}: ${table.columns_count} columns, ${table.row_count || 'unknown'} rows\n`;
      });
      
      if (tables.length > 10) {
        context += `... and ${tables.length - 10} more tables\n`;
      }
    }

    return context;
  }, [isConnected, databaseInfo, tables, selectedTables]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: DatabaseContextType = {
    connectionId,
    isConnected,
    isConnecting,
    error,
    databaseInfo,
    tables,
    selectedTables,
    connect,
    disconnect,
    setSelectedTables,
    refreshTables,
    executeQuery,
    getTableContext,
    clearError,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};