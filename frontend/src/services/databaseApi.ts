import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

interface ConnectionRequest {
  server: string;
  database: string;
  username: string;
  password: string;
  port?: number;
  driver?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  connectionTimeout?: number;
}

interface ConnectionResponse {
  connection_id: string;
  status: string;
  message: string;
  server_info?: any;
  available_drivers?: string[];
}

interface TableInfo {
  name: string;
  columns_count: number;
  row_count: number | null;
  type: string;
}

interface TableDetails {
  name: string;
  schema: string;
  row_count: number;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default: any;
    autoincrement: boolean;
  }>;
  indexes?: any[];
  sample_data?: any[];
}

interface DatabaseInfo {
  database_name: string;
  server_version: string;
  tables_count: number;
  total_size_mb: number;
  collation: string;
}

interface QueryResult {
  success: boolean;
  columns?: string[];
  data?: any[];
  row_count?: number;
  rows_affected?: number;
  error?: string;
  query: string;
}

class DatabaseApi {
  private axiosInstance = axios.create({
    baseURL: `${API_BASE_URL}/database`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  async getAvailableDrivers(): Promise<{
    all_drivers: string[];
    sql_drivers: string[];
    recommended: string | null;
    message: string;
  }> {
    const response = await this.axiosInstance.get('/drivers');
    return response.data;
  }

  async testConnection(request: ConnectionRequest): Promise<{
    success: boolean;
    message: string;
    server?: string;
    database?: string;
    error_type?: string;
    details?: any;
  }> {
    const response = await this.axiosInstance.post('/test-connection', request);
    return response.data;
  }

  async connect(request: ConnectionRequest): Promise<ConnectionResponse> {
    const response = await this.axiosInstance.post('/connect', request);
    return response.data;
  }

  async disconnect(connectionId: string): Promise<{
    status: string;
    message: string;
  }> {
    const response = await this.axiosInstance.delete(`/disconnect/${connectionId}`);
    return response.data;
  }

  async getActiveConnections(): Promise<{
    connections: Array<{
      connection_id: string;
      server: string;
      database: string;
      username: string;
      connected_at: string;
    }>;
    count: number;
  }> {
    const response = await this.axiosInstance.get('/connections');
    return response.data;
  }

  async getDatabaseInfo(connectionId: string): Promise<DatabaseInfo> {
    const response = await this.axiosInstance.get(`/database-info/${connectionId}`);
    return response.data;
  }

  async getTables(connectionId: string, includeSystem: boolean = false): Promise<{
    tables: TableInfo[];
    count: number;
  }> {
    const response = await this.axiosInstance.get(`/tables/${connectionId}`, {
      params: { include_system: includeSystem },
    });
    return response.data;
  }

  async getTableDetails(
    connectionId: string,
    tableName: string,
    includeSample: boolean = true,
    sampleSize: number = 10
  ): Promise<TableDetails> {
    const response = await this.axiosInstance.get(`/table/${connectionId}/${tableName}`, {
      params: {
        include_sample: includeSample,
        sample_size: sampleSize,
      },
    });
    return response.data;
  }

  async executeQuery(
    connectionId: string,
    query: string,
    limit: number = 100
  ): Promise<QueryResult> {
    const response = await this.axiosInstance.post(`/execute-query/${connectionId}`, {
      query,
      limit,
    });
    return response.data;
  }

  // Helper method to build connection string for display (without password)
  buildConnectionDisplay(request: Partial<ConnectionRequest>): string {
    const { server, database, username, port = 1433 } = request;
    return `Server=${server},${port};Database=${database};User=${username}`;
  }

  // Helper method to validate connection parameters
  validateConnectionParams(request: ConnectionRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.server) errors.push('Server address is required');
    if (!request.database) errors.push('Database name is required');
    if (!request.username) errors.push('Username is required');
    if (!request.password) errors.push('Password is required');

    if (request.port && (request.port < 1 || request.port > 65535)) {
      errors.push('Port must be between 1 and 65535');
    }

    if (request.connectionTimeout && request.connectionTimeout < 1) {
      errors.push('Connection timeout must be at least 1 second');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Helper method to parse SQL errors for user-friendly messages
  parseSQLError(error: any): string {
    const errorString = error.response?.data?.detail || error.message || 'Unknown error';

    if (errorString.includes('Login timeout expired')) {
      return 'Connection timeout - Please check if the server address is correct and accessible.';
    }
    if (errorString.includes('Login failed')) {
      return 'Authentication failed - Please verify your username and password.';
    }
    if (errorString.includes('Cannot open database')) {
      return 'Database not found - Please check if the database name is correct.';
    }
    if (errorString.includes('ODBC Driver')) {
      return 'Database driver not found - Please install the SQL Server ODBC driver.';
    }
    if (errorString.includes('server was not found')) {
      return 'Server not found - Please check the server address and network connection.';
    }
    if (errorString.includes('SSL') || errorString.includes('certificate')) {
      return 'SSL/Certificate error - Try enabling "Trust Server Certificate" in advanced settings.';
    }

    return errorString;
  }
}

export const databaseApi = new DatabaseApi();
export type { 
  ConnectionRequest, 
  ConnectionResponse, 
  TableInfo, 
  TableDetails, 
  DatabaseInfo, 
  QueryResult 
};