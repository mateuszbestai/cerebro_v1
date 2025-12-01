/**
 * Data Selection Step
 *
 * Allows users to select their data source:
 * - Connected database table
 * - GDM recommendations
 * - Upload CSV file
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { useDatabase } from '../../../contexts/DatabaseContext';
import { automlApi } from '../../../services/automlApi';
import {
  DataSource,
  SourceConfig,
  ColumnInfo,
  GDMAutoMLGuidance,
  DatabaseSourceConfig,
  GDMSourceConfig,
  FileSourceConfig,
} from '../../../types/automl';

interface DataSelectionStepProps {
  gdmJobId?: string;
  gdmGuidance?: GDMAutoMLGuidance;
  initialSource?: DataSource | null;
  initialConfig?: SourceConfig | null;
  onSelect: (
    source: DataSource,
    config: SourceConfig,
    columns: ColumnInfo[],
    previewData: Record<string, any>[]
  ) => void;
}

const DataSelectionStep: React.FC<DataSelectionStepProps> = ({
  gdmJobId,
  gdmGuidance,
  initialSource,
  initialConfig,
  onSelect,
}) => {
  const { connectionId, databaseInfo, tables } = useDatabase();
  const activeConnection = connectionId && databaseInfo ? { id: connectionId, database: databaseInfo.database_name } : null;

  const [selectedSource, setSelectedSource] = useState<DataSource | null>(initialSource || null);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);

  // Initialize from existing config
  useEffect(() => {
    if (initialConfig && 'table_name' in initialConfig) {
      setSelectedTable(initialConfig.table_name);
    }
  }, [initialConfig]);

  const handleSourceSelect = (source: DataSource) => {
    setSelectedSource(source);
    setError(null);
    setPreviewData([]);
    setColumns([]);
  };

  const handleTableSelect = async (tableName: string) => {
    setSelectedTable(tableName);
    setError(null);

    if (!activeConnection?.id) {
      setError('No database connection active');
      return;
    }

    setLoading(true);
    try {
      // Parse schema.table format
      let schema = 'dbo';
      let table = tableName;
      if (tableName.includes('.')) {
        [schema, table] = tableName.split('.');
      }

      const preview = await automlApi.getTablePreview(
        activeConnection.id,
        table,
        schema,
        100
      );

      setPreviewData(preview.rows);
      setColumns(
        preview.columns.map((col) => ({
          name: col,
          dtype: preview.dtypes[col] || 'unknown',
        }))
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load table preview');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setLoading(true);
    setError(null);

    try {
      const response = await automlApi.uploadFile(file);
      setColumns(
        response.columns.map((col) => ({
          name: col,
          dtype: response.dtypes[col] || 'unknown',
        }))
      );
      // Create preview from first rows (if available in response)
      setPreviewData([]);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file');
      setUploadedFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!selectedSource) return;

    let config: SourceConfig;

    if (selectedSource === 'database') {
      if (!selectedTable || !activeConnection?.id) {
        setError('Please select a table');
        return;
      }
      let schema = 'dbo';
      let table = selectedTable;
      if (selectedTable.includes('.')) {
        [schema, table] = selectedTable.split('.');
      }
      config = {
        connection_id: activeConnection.id,
        table_name: table,
        schema_name: schema,
      } as DatabaseSourceConfig;
    } else if (selectedSource === 'gdm') {
      if (!gdmJobId || !selectedTable) {
        setError('Please select a table from GDM recommendations');
        return;
      }
      config = {
        job_id: gdmJobId,
        table_name: selectedTable,
      } as GDMSourceConfig;
    } else if (selectedSource === 'file') {
      if (!uploadedFile) {
        setError('Please upload a file');
        return;
      }
      config = {
        file_path: uploadedFile.name,
      } as FileSourceConfig;
    } else {
      return;
    }

    onSelect(selectedSource, config, columns, previewData);
  };

  const isReadyToContinue =
    selectedSource &&
    ((selectedSource === 'database' && selectedTable && columns.length > 0) ||
      (selectedSource === 'gdm' && selectedTable && columns.length > 0) ||
      (selectedSource === 'file' && uploadedFile && columns.length > 0));

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Select Your Data
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose where your training data comes from. We'll analyze it to help you build a prediction model.
      </Typography>

      {/* Connection Warning */}
      {!activeConnection && !gdmJobId && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No active database connection. Please connect to a database from the Database page to use the "Database Table" option,
          or use the "Upload File" option to train with your own CSV/Excel file.
        </Alert>
      )}

      {/* Source Selection Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Database Option */}
        <Grid item xs={12} md={4}>
          <Card
            variant="outlined"
            sx={{
              borderColor: selectedSource === 'database' ? 'primary.main' : 'divider',
              borderWidth: selectedSource === 'database' ? 2 : 1,
            }}
          >
            <CardActionArea
              onClick={() => handleSourceSelect('database')}
              disabled={!activeConnection}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <StorageIcon
                  sx={{
                    fontSize: 48,
                    color: selectedSource === 'database' ? 'primary.main' : 'action.disabled',
                    mb: 1,
                  }}
                />
                <Typography variant="h6">Database Table</Typography>
                <Typography variant="body2" color="text.secondary">
                  {activeConnection
                    ? `Connected to ${activeConnection.database}`
                    : 'No connection active'}
                </Typography>
                {selectedSource === 'database' && (
                  <CheckCircleIcon color="primary" sx={{ mt: 1 }} />
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* GDM Option */}
        <Grid item xs={12} md={4}>
          <Card
            variant="outlined"
            sx={{
              borderColor: selectedSource === 'gdm' ? 'primary.main' : 'divider',
              borderWidth: selectedSource === 'gdm' ? 2 : 1,
            }}
          >
            <CardActionArea
              onClick={() => handleSourceSelect('gdm')}
              disabled={!gdmJobId}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <AutoGraphIcon
                  sx={{
                    fontSize: 48,
                    color: selectedSource === 'gdm' ? 'primary.main' : 'action.disabled',
                    mb: 1,
                  }}
                />
                <Typography variant="h6">GDM Recommendations</Typography>
                <Typography variant="body2" color="text.secondary">
                  {gdmJobId ? 'AI-analyzed data available' : 'Run GDM analysis first'}
                </Typography>
                {gdmGuidance?.data_readiness && (
                  <Chip
                    size="small"
                    label={gdmGuidance.data_readiness.recommendation}
                    color={gdmGuidance.data_readiness.status === 'ready' ? 'success' : 'warning'}
                    sx={{ mt: 1 }}
                  />
                )}
                {selectedSource === 'gdm' && (
                  <CheckCircleIcon color="primary" sx={{ mt: 1 }} />
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* File Upload Option */}
        <Grid item xs={12} md={4}>
          <Card
            variant="outlined"
            sx={{
              borderColor: selectedSource === 'file' ? 'primary.main' : 'divider',
              borderWidth: selectedSource === 'file' ? 2 : 1,
            }}
          >
            <CardActionArea onClick={() => handleSourceSelect('file')}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <UploadFileIcon
                  sx={{
                    fontSize: 48,
                    color: selectedSource === 'file' ? 'primary.main' : 'action.disabled',
                    mb: 1,
                  }}
                />
                <Typography variant="h6">Upload File</Typography>
                <Typography variant="body2" color="text.secondary">
                  CSV, Excel, or Parquet
                </Typography>
                {selectedSource === 'file' && (
                  <CheckCircleIcon color="primary" sx={{ mt: 1 }} />
                )}
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Database Table Selection */}
      {selectedSource === 'database' && activeConnection && (
        <Box sx={{ mb: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Select Table</InputLabel>
            <Select
              value={selectedTable}
              label="Select Table"
              onChange={(e) => handleTableSelect(e.target.value)}
            >
              {tables.map((table) => (
                <MenuItem key={table.name} value={table.name}>
                  {table.name}
                  {table.row_count && (
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      ({table.row_count.toLocaleString()} rows)
                    </Typography>
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* GDM Table Selection */}
      {selectedSource === 'gdm' && gdmGuidance && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Recommended Tables from GDM Analysis
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Select Table</InputLabel>
            <Select
              value={selectedTable}
              label="Select Table"
              onChange={(e) => handleTableSelect(e.target.value)}
            >
              {gdmGuidance.recommended_targets.map((target) => (
                <MenuItem key={`${target.table}.${target.column}`} value={target.table}>
                  {target.table}
                  <Chip
                    size="small"
                    label={target.task}
                    color={target.task === 'classification' ? 'primary' : 'secondary'}
                    sx={{ ml: 1 }}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* File Upload */}
      {selectedSource === 'file' && (
        <Box sx={{ mb: 3 }}>
          <input
            accept=".csv,.xlsx,.xls,.parquet"
            style={{ display: 'none' }}
            id="file-upload"
            type="file"
            onChange={handleFileUpload}
          />
          <label htmlFor="file-upload">
            <Button variant="outlined" component="span" startIcon={<UploadFileIcon />}>
              Choose File
            </Button>
          </label>
          {uploadedFile && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Selected: {uploadedFile.name}
            </Typography>
          )}
        </Box>
      )}

      {/* Loading Indicator */}
      {loading && (
        <Box display="flex" justifyContent="center" my={3}>
          <CircularProgress />
        </Box>
      )}

      {/* Data Preview */}
      {previewData.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Data Preview ({columns.length} columns)
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.slice(0, 8).map((col) => (
                    <TableCell key={col.name}>
                      <Typography variant="caption" fontWeight="bold">
                        {col.name}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {col.dtype}
                      </Typography>
                    </TableCell>
                  ))}
                  {columns.length > 8 && (
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        +{columns.length - 8} more
                      </Typography>
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {previewData.slice(0, 5).map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.slice(0, 8).map((col) => (
                      <TableCell key={col.name}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {String(row[col.name] ?? '')}
                        </Typography>
                      </TableCell>
                    ))}
                    {columns.length > 8 && <TableCell>...</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary">
            Showing first 5 rows
          </Typography>
        </Box>
      )}

      {/* Column Info (when no preview) */}
      {columns.length > 0 && previewData.length === 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Detected Columns ({columns.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {columns.map((col) => (
              <Chip
                key={col.name}
                label={`${col.name} (${col.dtype})`}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Continue Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
        <Button
          variant="contained"
          size="large"
          disabled={!isReadyToContinue || loading}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
};

export default DataSelectionStep;
