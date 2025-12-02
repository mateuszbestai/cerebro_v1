import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { databaseApi, ConnectionRequest, TableInfo, DatabaseInfo } from '../services/databaseApi';

export type DataSourceType = 'database' | 'csv';

export interface CsvDataset {
  name: string;
  columns: string[];
  rowCount: number;
  data: any[];
}

interface DatabaseContextType {
  // State
  connectionId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  databaseInfo: DatabaseInfo | null;
  tables: TableInfo[];
  selectedTables: string[];
  activeSource: DataSourceType | null;
  csvDataset: CsvDataset | null;
  csvError: string | null;
  isCsvLoading: boolean;
  csvSampleLimit: number;
  
  // Actions
  connect: (params: ConnectionRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  setSelectedTables: (tables: string[]) => void;
  refreshTables: () => Promise<void>;
  executeQuery: (query: string) => Promise<any>;
  getTableContext: () => string;
  clearError: () => void;
  setActiveSource: (source: DataSourceType | null) => void;
  loadCsvDataset: (file: File, rowLimit?: number) => Promise<void>;
  clearCsvDataset: () => void;
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
  const [activeSource, setActiveSourceState] = useState<DataSourceType | null>(null);
  const [csvDataset, setCsvDataset] = useState<CsvDataset | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isCsvLoading, setIsCsvLoading] = useState(false);

  const CSV_ROW_LIMIT = 750;

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
      setActiveSourceState('database');
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
    setActiveSourceState(csvDataset ? 'csv' : null);
  };

  const parseCsvFile = useCallback((file: File, rowLimit: number): Promise<CsvDataset> => {
    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      let totalRows = 0;
      let columns: string[] = [];

      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        worker: true,
        chunkSize: 1024 * 1024,
        chunk: (results) => {
          const dataChunk = (results.data as any[]) || [];
          const fields = (results.meta?.fields as string[] | undefined) || [];
          if (columns.length === 0 && fields.length > 0) {
            columns = fields.filter(Boolean);
          }

          totalRows += dataChunk.length;
          const remaining = rowLimit - rows.length;
          if (remaining > 0) {
            rows.push(...dataChunk.slice(0, remaining));
          }
        },
        complete: () => {
          if (columns.length === 0 && rows.length > 0) {
            columns = Object.keys(rows[0]);
          }
          resolve({
            name: file.name,
            columns,
            rowCount: totalRows || rows.length,
            data: rows.slice(0, rowLimit),
          });
        },
        error: (err) => reject(err),
      });
    });
  }, []);

  const setActiveSource = useCallback((source: DataSourceType | null) => {
    if (source === 'database' && !isConnected) return;
    if (source === 'csv' && !csvDataset) return;
    setActiveSourceState(source);
  }, [csvDataset, isConnected]);

  const loadCsvDataset = useCallback(async (file: File, rowLimit: number = CSV_ROW_LIMIT) => {
    setIsCsvLoading(true);
    setCsvError(null);
    try {
      const parsed = await parseCsvFile(file, rowLimit);
      setCsvDataset(parsed);
      setActiveSourceState('csv');
    } catch (err: any) {
      const message = err?.message || 'Failed to load CSV file';
      setCsvError(message);
      throw err;
    } finally {
      setIsCsvLoading(false);
    }
  }, [parseCsvFile]);

  const clearCsvDataset = useCallback(() => {
    setCsvDataset(null);
    setCsvError(null);
    if (activeSource === 'csv') {
      setActiveSourceState(isConnected ? 'database' : null);
    }
  }, [activeSource, isConnected]);

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
        setActiveSourceState('database');
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
    if (activeSource === 'csv' && csvDataset) {
      const columnList = csvDataset.columns.slice(0, 25).join(', ');
      const truncated = csvDataset.columns.length > 25 ? ' ...' : '';
      return [
        `Uploaded dataset: ${csvDataset.name}`,
        `Rows available: ~${csvDataset.rowCount} (using first ${csvDataset.data.length} rows for analysis)`,
        `Columns (${csvDataset.columns.length}): ${columnList}${truncated}`,
      ].join('\n');
    }

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
  }, [activeSource, csvDataset, isConnected, databaseInfo, tables, selectedTables]);

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
    activeSource,
    csvDataset,
    csvError,
    isCsvLoading,
    csvSampleLimit: CSV_ROW_LIMIT,
    connect,
    disconnect,
    setSelectedTables,
    refreshTables,
    executeQuery,
    getTableContext,
    clearError,
    setActiveSource,
    loadCsvDataset,
    clearCsvDataset,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};
