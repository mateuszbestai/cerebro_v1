/**
 * AutoMLStudioPanel - Streamlined AutoML Interface
 *
 * A compact single-panel AutoML interface that:
 * - Auto-fills from GDM guidance when available
 * - Provides quick preset selection (Quick/Balanced/Thorough)
 * - Shows inline training progress
 * - Displays results summary with link to forecasts
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  LinearProgress,
  CircularProgress,
  Divider,
  Tooltip,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import SpeedIcon from '@mui/icons-material/Speed';
import BalanceIcon from '@mui/icons-material/Balance';
import ScienceIcon from '@mui/icons-material/Science';
import InsightsIcon from '@mui/icons-material/Insights';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CategoryIcon from '@mui/icons-material/Category';
import TimelineIcon from '@mui/icons-material/Timeline';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { useAssistant } from '../../contexts/AssistantContext';
import { useDatabase } from '../../contexts/DatabaseContext';
import { automlApi } from '../../services/automlApi';
import { gdmApi, AutomlTargetRecommendation } from '../../services/gdmApi';
import {
  Preset,
  ProblemType,
  AutoMLStartRequest,
  AutoMLStatusResponse,
  ColumnInfo,
} from '../../types/automl';

// Use ProblemType for the task state to support all 5 problem types
type TaskType = ProblemType;
import PlaybookRunner from '../Playbooks/PlaybookRunner';

const PRESETS: { value: Preset; label: string; description: string; icon: React.ReactNode; time: string }[] = [
  { value: 'quick', label: 'Quick', description: 'Fast results for exploration', icon: <SpeedIcon />, time: '~5 min' },
  { value: 'balanced', label: 'Balanced', description: 'Good balance of speed and accuracy', icon: <BalanceIcon />, time: '~15 min' },
  { value: 'thorough', label: 'Thorough', description: 'Best accuracy, slower training', icon: <ScienceIcon />, time: '~60 min' },
];

interface AutoMLStudioPanelProps {
  onShowResults?: () => void;
}

const AutoMLStudioPanel: React.FC<AutoMLStudioPanelProps> = ({ onShowResults }) => {
  const theme = useTheme();
  const {
    gdmJobId,
    automlJobId,
    automlStatus,
    setAutomlJobId,
    setAutomlStatus,
  } = useAssistant();
  const { connectionId, tables, isConnected } = useDatabase();

  // Form state
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [task, setTask] = useState<TaskType>('classification');
  const [preset, setPreset] = useState<Preset>('balanced');

  // Data state
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [recommendations, setRecommendations] = useState<AutomlTargetRecommendation[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<AutoMLStatusResponse | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);

  // Check service availability
  useEffect(() => {
    const checkService = async () => {
      try {
        const status = await automlApi.getServiceStatus();
        setServiceAvailable(status.available);
        if (!status.available) {
          setError(status.message);
        }
      } catch {
        setServiceAvailable(false);
        setError('Could not connect to AutoML service');
      }
    };
    checkService();
  }, []);

  // Load GDM guidance if available
  useEffect(() => {
    const loadGdmGuidance = async () => {
      if (!gdmJobId) return;

      try {
        const results = await gdmApi.getResults(gdmJobId);
        if (results.automl_guidance) {
          setRecommendations(results.automl_guidance.recommended_targets || []);

          // Auto-select top recommendation
          const topRec = results.automl_guidance.recommended_targets?.[0];
          if (topRec) {
            setSelectedTable(topRec.table);
            setTargetColumn(topRec.column);
            setTask(topRec.task as TaskType);
          }
        }
      } catch (err) {
        console.error('Failed to load GDM guidance:', err);
      }
    };
    loadGdmGuidance();
  }, [gdmJobId]);

  // Load table columns when table is selected
  useEffect(() => {
    const loadColumns = async () => {
      if (!selectedTable || !connectionId) return;

      try {
        const parts = selectedTable.split('.');
        const tableName = parts.length > 1 ? parts[1] : parts[0];
        const schemaName = parts.length > 1 ? parts[0] : 'dbo';

        const preview = await automlApi.getTablePreview(connectionId, tableName, schemaName, 10);
        const colInfos: ColumnInfo[] = preview.columns.map((col) => ({
          name: col,
          dtype: preview.dtypes[col] || 'unknown',
        }));
        setColumns(colInfos);
      } catch (err) {
        console.error('Failed to load columns:', err);
      }
    };
    loadColumns();
  }, [selectedTable, connectionId]);

  // Poll job status during training
  useEffect(() => {
    if (!automlJobId || automlStatus !== 'training') return;

    const interval = setInterval(async () => {
      try {
        const status = await automlApi.getJobStatus(automlJobId);
        setJobStatus(status);

        if (status.status === 'completed') {
          setAutomlStatus('completed');
          clearInterval(interval);
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          setAutomlStatus('failed');
          setError(status.error || 'Training failed');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Failed to get job status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [automlJobId, automlStatus, setAutomlStatus]);

  const handleStartTraining = async () => {
    if (!selectedTable || !targetColumn || !connectionId) {
      setError('Please select a table and target column');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const parts = selectedTable.split('.');
      const tableName = parts.length > 1 ? parts[1] : parts[0];
      const schemaName = parts.length > 1 ? parts[0] : 'dbo';

      const request: AutoMLStartRequest = {
        task,
        target_column: targetColumn,
        source: gdmJobId ? 'gdm' : 'database',
        source_config: gdmJobId
          ? { job_id: gdmJobId, table_name: selectedTable }
          : { connection_id: connectionId, table_name: tableName, schema_name: schemaName },
        preset,
        tags: gdmJobId ? { gdm_job_id: gdmJobId } : undefined,
      };

      const response = await automlApi.startJob(request);

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.job_id) {
        setAutomlJobId(response.job_id);
        setAutomlStatus('training');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start training');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTraining = async () => {
    if (!automlJobId) return;

    try {
      await automlApi.cancelJob(automlJobId);
      setAutomlStatus('failed');
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const handleReset = () => {
    setAutomlJobId(null);
    setAutomlStatus('idle');
    setJobStatus(null);
    setError(null);
  };

  const handleApplyRecommendation = (rec: AutomlTargetRecommendation) => {
    setSelectedTable(rec.table);
    setTargetColumn(rec.column);
    setTask(rec.task as TaskType);
  };

  // Render service unavailable state
  if (serviceAvailable === false) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <Typography variant="h6">AutoML Service Unavailable</Typography>
          <Typography variant="body2">
            The AutoML service is not available. Please ensure AutoGluon is installed and the backend is running.
          </Typography>
        </Alert>
      </Box>
    );
  }

  // Render loading state
  if (serviceAvailable === null) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Grid container spacing={3}>
        {/* Header */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <AutoGraphIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography variant="h5">AutoML Studio</Typography>
              <Typography variant="body2" color="text.secondary">
                Train machine learning models without writing code
              </Typography>
            </Box>
          </Box>
        </Grid>

        {/* Playbook Launcher */}
        <Grid item xs={12}>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box>
              <Typography variant="subtitle1">Run a GDM Playbook</Typography>
              <Typography variant="body2" color="text.secondary">
                Launch AutoGluon training using the playbook generated from your Global Data Model.
              </Typography>
            </Box>
            <PlaybookRunner
              onJobLaunched={(jobId) => {
                setAutomlJobId(jobId);
                setAutomlStatus('training');
              }}
              gdmJobId={gdmJobId || undefined}
              prefillTarget={{
                table: selectedTable || recommendations[0]?.table || undefined,
                column: targetColumn || recommendations[0]?.column || undefined,
                task,
              }}
            />
          </Paper>
        </Grid>

        {/* GDM Recommendations */}
        {recommendations.length > 0 && automlStatus === 'idle' && (
          <Grid item xs={12}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
                borderColor: alpha(theme.palette.info.main, 0.3),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LightbulbIcon color="info" />
                <Typography variant="subtitle1" fontWeight={600}>
                  GDM Recommendations
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {recommendations.slice(0, 5).map((rec, idx) => (
                  <Chip
                    key={idx}
                    label={`${rec.table.split('.').pop()}.${rec.column}`}
                    icon={rec.task === 'classification' ? <CategoryIcon /> : <TrendingUpIcon />}
                    color={selectedTable === rec.table && targetColumn === rec.column ? 'primary' : 'default'}
                    variant={selectedTable === rec.table && targetColumn === rec.column ? 'filled' : 'outlined'}
                    onClick={() => handleApplyRecommendation(rec)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Configuration Form */}
        {automlStatus === 'idle' && (
          <>
            {/* Data Source */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Table</InputLabel>
                <Select
                  value={selectedTable}
                  label="Table"
                  onChange={(e) => {
                    setSelectedTable(e.target.value);
                    setTargetColumn('');
                  }}
                  disabled={!isConnected}
                >
                  {tables.map((table) => (
                    <MenuItem key={table.name} value={table.name}>
                      {table.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Target Column */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Target Column</InputLabel>
                <Select
                  value={targetColumn}
                  label="Target Column"
                  onChange={(e) => setTargetColumn(e.target.value)}
                  disabled={!selectedTable || columns.length === 0}
                >
                  {columns.map((col) => (
                    <MenuItem key={col.name} value={col.name}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {col.name}
                        <Chip label={col.dtype} size="small" sx={{ fontSize: '0.7rem', height: 18 }} />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Task Type */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Problem Type</InputLabel>
                <Select
                  value={task}
                  label="Problem Type"
                  onChange={(e) => setTask(e.target.value as TaskType)}
                >
                  <MenuItem value="classification">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CategoryIcon fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="body2">Classification</Typography>
                        <Typography variant="caption" color="text.secondary">Predict categories (yes/no, churn/retain)</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                  <MenuItem value="regression">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUpIcon fontSize="small" color="success" />
                      <Box>
                        <Typography variant="body2">Regression</Typography>
                        <Typography variant="caption" color="text.secondary">Predict numeric values (revenue, price)</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                  <MenuItem value="forecasting">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TimelineIcon fontSize="small" color="info" />
                      <Box>
                        <Typography variant="body2">Forecasting</Typography>
                        <Typography variant="caption" color="text.secondary">Predict future time series values</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                  <MenuItem value="clustering">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BubbleChartIcon fontSize="small" color="secondary" />
                      <Box>
                        <Typography variant="body2">Clustering</Typography>
                        <Typography variant="caption" color="text.secondary">Group similar records together</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                  <MenuItem value="anomaly">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningAmberIcon fontSize="small" color="warning" />
                      <Box>
                        <Typography variant="body2">Anomaly Detection</Typography>
                        <Typography variant="caption" color="text.secondary">Find unusual or suspicious records</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Preset Selection */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Training Speed
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {PRESETS.map((p) => (
                  <Tooltip key={p.value} title={`${p.description} (${p.time})`}>
                    <Chip
                      icon={p.icon as React.ReactElement}
                      label={p.label}
                      variant={preset === p.value ? 'filled' : 'outlined'}
                      color={preset === p.value ? 'primary' : 'default'}
                      onClick={() => setPreset(p.value)}
                      sx={{ cursor: 'pointer' }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Grid>

            {/* Error Display */}
            {error && (
              <Grid item xs={12}>
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              </Grid>
            )}

            {/* Start Button */}
            <Grid item xs={12}>
              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                onClick={handleStartTraining}
                disabled={loading || !selectedTable || !targetColumn || !isConnected}
                fullWidth
                sx={{ py: 1.5 }}
              >
                {loading ? 'Starting...' : 'Start Training'}
              </Button>
              {!isConnected && (
                <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                  Connect to a database first
                </Typography>
              )}
            </Grid>
          </>
        )}

        {/* Training Progress */}
        {automlStatus === 'training' && jobStatus && (
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Training in Progress</Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={handleCancelTraining}
                    size="small"
                  >
                    Cancel
                  </Button>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={jobStatus.progress_pct}
                  sx={{ mb: 2, height: 8, borderRadius: 4 }}
                />

                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Progress</Typography>
                    <Typography variant="h6">{jobStatus.progress_pct}%</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Models Trained</Typography>
                    <Typography variant="h6">{jobStatus.models_trained}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Best Model</Typography>
                    <Typography variant="h6">{jobStatus.best_model || '-'}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Best Score</Typography>
                    <Typography variant="h6">
                      {jobStatus.best_score !== null ? (jobStatus.best_score * 100).toFixed(1) + '%' : '-'}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Typography variant="body2" color="text.secondary">
                  Current: {jobStatus.current_step}
                </Typography>
                {jobStatus.estimated_remaining && (
                  <Typography variant="caption" color="text.secondary">
                    Estimated time remaining: {Math.round(jobStatus.estimated_remaining / 60)} min
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Completed Results Summary */}
        {automlStatus === 'completed' && jobStatus && (
          <Grid item xs={12}>
            <Card
              variant="outlined"
              sx={{
                bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
                borderColor: alpha(theme.palette.success.main, 0.3),
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                  <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="h5">Training Complete!</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Your model is ready for predictions and analysis
                    </Typography>
                  </Box>
                </Box>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Best Model</Typography>
                    <Typography variant="h6">{jobStatus.best_model}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Accuracy</Typography>
                    <Typography variant="h6" color="success.main">
                      {jobStatus.best_score !== null ? (jobStatus.best_score * 100).toFixed(1) + '%' : '-'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Models Trained</Typography>
                    <Typography variant="h6">{jobStatus.models_trained}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Training Time</Typography>
                    <Typography variant="h6">{Math.round(jobStatus.elapsed_seconds / 60)} min</Typography>
                  </Grid>
                </Grid>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<InsightsIcon />}
                    onClick={() => onShowResults?.()}
                    sx={{ flex: 1 }}
                  >
                    View AI Insights & Forecasts
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={handleReset}
                  >
                    Train New Model
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Failed State */}
        {automlStatus === 'failed' && (
          <Grid item xs={12}>
            <Alert
              severity="error"
              icon={<ErrorIcon />}
              action={
                <Button color="inherit" size="small" onClick={handleReset}>
                  Try Again
                </Button>
              }
            >
              <Typography variant="subtitle2">Training Failed</Typography>
              <Typography variant="body2">{error || 'An error occurred during training'}</Typography>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default AutoMLStudioPanel;
