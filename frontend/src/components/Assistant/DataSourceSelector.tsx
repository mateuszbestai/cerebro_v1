import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  Chip,
  Stack,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  UploadFile as UploadFileIcon,
  CheckCircle as CheckIcon,
  SwapHoriz as SwitchIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useDatabase } from '../../contexts/DatabaseContext';
import CreateGDMButton from '../Database/CreateGDMButton';

interface DataSourceSelectorProps {
  onConnectClick: () => void;
}

const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({ onConnectClick }) => {
  const {
    isConnected,
    databaseInfo,
    activeSource,
    setActiveSource,
    csvDataset,
    loadCsvDataset,
    clearCsvDataset,
    isCsvLoading,
    csvError,
    csvSampleLimit,
  } = useDatabase();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const databaseActive = activeSource === 'database' && isConnected;
  const csvActive = activeSource === 'csv' && !!csvDataset;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadCsvDataset(file).catch(() => null);
    }
    // Allow re-uploading the same file
    event.target.value = '';
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 3 },
        mb: 2,
        borderRadius: 'var(--radius)',
        borderColor: 'divider',
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.background.paper, 0.8)
            : '#f6faf2',
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box>
          <Typography variant="h6" gutterBottom>
            Choose how you want to start
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Connect a live database or upload a CSV table to run AI analysis in the assistant.
          </Typography>
        </Box>
        {(databaseActive || csvActive) && (
          <Chip
            color="primary"
            icon={<CheckIcon />}
            label={`Active source: ${csvActive ? 'CSV upload' : 'Database'}`}
          />
        )}
      </Box>

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Box
            sx={(theme) => ({
              border: `1px solid ${databaseActive ? theme.palette.primary.main : theme.palette.divider}`,
              borderRadius: 'var(--radius)',
              p: 2,
              height: '100%',
              background: databaseActive
                ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.12)
                : theme.palette.background.paper,
            })}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <DatabaseIcon color={databaseActive ? 'primary' : 'action'} />
              <Box>
                <Typography variant="subtitle1">SQL Database</Typography>
                <Typography variant="body2" color="text.secondary">
                  Connect to your SQL Server database and query live tables.
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {isConnected ? (
                <Chip
                  variant={databaseActive ? 'filled' : 'outlined'}
                  color="success"
                  icon={<CheckIcon />}
                  label={`Connected to ${databaseInfo?.database_name || 'database'}`}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not connected yet.
                </Typography>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={onConnectClick}
                  startIcon={<DatabaseIcon />}
                  color="primary"
                >
                  {isConnected ? 'Manage connection' : 'Connect database'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SwitchIcon />}
                  onClick={() => setActiveSource('database')}
                  disabled={!isConnected}
                >
                  Use database
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box
            sx={(theme) => ({
              border: `1px solid ${csvActive ? theme.palette.primary.main : theme.palette.divider}`,
              borderRadius: 'var(--radius)',
              p: 2,
              height: '100%',
              background: csvActive
                ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.12)
                : theme.palette.background.paper,
            })}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <UploadFileIcon color={csvActive ? 'primary' : 'action'} />
              <Box>
                <Typography variant="subtitle1">CSV table</Typography>
                <Typography variant="body2" color="text.secondary">
                  Load a CSV and let the assistant analyze it with pandas.
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={1.5} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCsvLoading}
                >
                  Load CSV file
                </Button>
                {csvDataset && (
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={clearCsvDataset}
                  >
                    Clear
                  </Button>
                )}
              </Stack>

              {isCsvLoading && <LinearProgress />}

              {csvDataset && (
                <Box>
                  <Chip
                    icon={<CheckIcon />}
                    color={csvActive ? 'primary' : 'default'}
                    label={`${csvDataset.name} • ${csvDataset.columns.length} columns • ~${csvDataset.rowCount} rows`}
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Using the first {csvDataset.data.length} rows (up to {csvSampleLimit}) for fast analysis.
                  </Typography>
                </Box>
              )}

              {csvDataset && (
                <Box sx={{ mt: 1 }}>
                  <CreateGDMButton dbId={null} csvDataset={csvDataset} />
                </Box>
              )}

              {csvError && (
                <Alert severity="error" variant="outlined">
                  {csvError}
                </Alert>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  startIcon={<SwitchIcon />}
                  onClick={() => setActiveSource('csv')}
                  disabled={!csvDataset}
                >
                  Use CSV
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default DataSourceSelector;
