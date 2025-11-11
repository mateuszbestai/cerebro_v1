import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Tooltip,
  Checkbox,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  TableChart as TableIcon,
  Info as InfoIcon,
  Storage as StorageIcon,
  Analytics as AnalyticsIcon,
  Preview as PreviewIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { databaseApi } from '../../services/databaseApi';
import { useDatabase } from '../../contexts/DatabaseContext';
import { alpha, useTheme } from '@mui/material/styles';
import CreateGDMButton from './CreateGDMButton';

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

// DatabaseInfo interface is imported from useDatabase context, no need to redefine

const TablesDashboard: React.FC = () => {
  const { 
    connectionId, 
    selectedTables, 
    setSelectedTables, 
    disconnect,
    databaseInfo,
    tables: contextTables,
    refreshTables,
    isConnected
  } = useDatabase();
  const theme = useTheme();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [filteredTables, setFilteredTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetails, setTableDetails] = useState<TableDetails | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Use tables from context instead of loading separately
    if (contextTables && contextTables.length > 0) {
      setTables(contextTables);
    }
  }, [contextTables]);

  useEffect(() => {
    filterTables();
  }, [searchTerm, tables]);

  // Database info comes from context now, no need to load separately

  const loadTables = async () => {
    if (!connectionId) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Use the refreshTables from context
      await refreshTables();
    } catch (err: any) {
      setError('Failed to load tables: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filterTables = () => {
    if (!searchTerm) {
      setFilteredTables(tables);
    } else {
      const filtered = tables.filter(table =>
        table.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTables(filtered);
    }
  };

  const handleTableSelect = (tableName: string) => {
    const newSelection = selectedTables.includes(tableName)
      ? selectedTables.filter(t => t !== tableName)
      : [...selectedTables, tableName];
    
    setSelectedTables(newSelection);
  };

  const handleTableDetails = async (tableName: string) => {
    if (!connectionId) return;
    
    setSelectedTable(tableName);
    setDetailsDialogOpen(true);
    
    try {
      const details = await databaseApi.getTableDetails(connectionId, tableName);
      setTableDetails(details);
    } catch (err) {
      console.error('Error loading table details:', err);
    }
  };

  const handleAnalyzeTable = (tableName: string) => {
    // This will trigger analysis in the chat
    const message = `Analyze the ${tableName} table and provide insights about its structure and data patterns.`;
    // You would trigger this through your chat interface
    console.log('Analyze table:', tableName, message);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / 1024 / 1024;
    return mb > 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return 'N/A';
    return num.toLocaleString();
  };

  if (!isConnected || !connectionId) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="info">
          No database connected. Please connect to a database first.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Database Info Header */}
      {databaseInfo && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center">
                <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">{databaseInfo.database_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {databaseInfo.server_version.split(' ')[0]}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="body2" color="text.secondary">Tables</Typography>
              <Typography variant="h6">{databaseInfo.tables_count}</Typography>
            </Grid>
            <Grid item xs={6} md={2}>
              <Typography variant="body2" color="text.secondary">Size</Typography>
              <Typography variant="h6">{formatBytes(databaseInfo.total_size_mb * 1024 * 1024)}</Typography>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={disconnect}
                fullWidth
              >
                Disconnect
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Global Data Model */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <CreateGDMButton dbId={connectionId} />
      </Paper>

      {/* Search and Actions */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <Chip
              label={`${selectedTables.length} selected`}
              color={selectedTables.length > 0 ? 'primary' : 'default'}
              icon={<CheckIcon />}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <Button
              fullWidth
              startIcon={<RefreshIcon />}
              onClick={loadTables}
              disabled={loading}
            >
              Refresh
            </Button>
          </Grid>
        </Grid>

        {selectedTables.length > 0 && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.08),
              borderRadius: 1,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
            }}
          >
            <Typography variant="body2">
              Selected tables for analysis: {selectedTables.join(', ')}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Tables Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredTables.map((table) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={table.name}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor: selectedTables.includes(table.name) ? 'action.selected' : 'background.paper',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 3,
                  },
                }}
              >
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box display="flex" alignItems="center">
                      <TableIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="subtitle1" noWrap sx={{ maxWidth: 150 }}>
                        {table.name}
                      </Typography>
                    </Box>
                    <Checkbox
                      checked={selectedTables.includes(table.name)}
                      onChange={() => handleTableSelect(table.name)}
                      color="primary"
                    />
                  </Box>
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Columns: {table.columns_count}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Rows: {formatNumber(table.row_count)}
                    </Typography>
                  </Box>
                </CardContent>
                
                <CardActions>
                  <Tooltip title="View Details">
                    <IconButton size="small" onClick={() => handleTableDetails(table.name)}>
                      <InfoIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Analyze">
                    <IconButton size="small" onClick={() => handleAnalyzeTable(table.name)}>
                      <AnalyticsIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Preview Data">
                    <IconButton size="small" onClick={() => handleTableDetails(table.name)}>
                      <PreviewIcon />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Table Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              {selectedTable} Details
            </Typography>
            <IconButton onClick={() => setDetailsDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          {tableDetails && (
            <>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Schema" />
                <Tab label="Sample Data" />
                <Tab label="SQL Preview" />
              </Tabs>

              {/* Schema Tab */}
              {activeTab === 0 && (
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Column Name</TableCell>
                        <TableCell>Data Type</TableCell>
                        <TableCell>Nullable</TableCell>
                        <TableCell>Default</TableCell>
                        <TableCell>Auto Increment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableDetails.columns.map((col) => (
                        <TableRow key={col.name}>
                          <TableCell>{col.name}</TableCell>
                          <TableCell>
                            <Chip label={col.type} size="small" />
                          </TableCell>
                          <TableCell>
                            {col.nullable ? <CheckIcon color="success" /> : <CloseIcon color="error" />}
                          </TableCell>
                          <TableCell>{col.default || '-'}</TableCell>
                          <TableCell>
                            {col.autoincrement ? <CheckIcon color="primary" /> : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Sample Data Tab */}
              {activeTab === 1 && tableDetails.sample_data && (
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {tableDetails.columns.map((col) => (
                          <TableCell key={col.name}>{col.name}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableDetails.sample_data.map((row, idx) => (
                        <TableRow key={idx}>
                          {tableDetails.columns.map((col) => (
                            <TableCell key={col.name}>
                              {row[col.name]?.toString() || 'NULL'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* SQL Preview Tab */}
              {activeTab === 2 && (
                <Box>
                  <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">SELECT Query</Typography>
                      <IconButton size="small" onClick={() => copyToClipboard(`SELECT * FROM ${selectedTable}`)}>
                        <CopyIcon />
                      </IconButton>
                    </Box>
                    <Typography variant="body2" component="pre" sx={{ mt: 1, fontFamily: 'monospace' }}>
                      {`SELECT * FROM ${selectedTable} LIMIT 100;`}
                    </Typography>
                  </Paper>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              handleAnalyzeTable(selectedTable!);
              setDetailsDialogOpen(false);
            }}
          >
            Analyze This Table
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TablesDashboard;
