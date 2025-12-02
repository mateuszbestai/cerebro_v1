/**
 * PlaybookExecutor - Step 3: Execute Generated Playbook
 *
 * Allows users to run the AutoML playbook that was generated from GDM.
 * Shows a "Run Playbook" button that launches the AutoML training job.
 */

import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
  CircularProgress,
  LinearProgress,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import TimerIcon from '@mui/icons-material/Timer';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { alpha, useTheme } from '@mui/material/styles';

import { apiClient } from '../../services/api';
import { automlApi } from '../../services/automlApi';
import { AutoMLStatusResponse } from '../../types/automl';

interface PlaybookExecutorProps {
  playbook: {
    id: string;
    name: string;
    description?: string;
    defaults?: {
      target_column?: string;
      target_table?: string;
      task?: string;
      metric?: string;
      time_limit_minutes?: number;
    };
  };
  gdmJobId: string;
  overrides?: Record<string, any>;
  onJobLaunched?: (jobId: string) => void;
}

const PlaybookExecutor: React.FC<PlaybookExecutorProps> = ({
  playbook,
  gdmJobId,
  overrides,
  onJobLaunched,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<AutoMLStatusResponse | null>(null);
  const [executing, setExecuting] = useState(false);

  // Poll job status when running
  useEffect(() => {
    if (!jobId || !executing) return;

    const interval = setInterval(async () => {
      try {
        const status = await automlApi.getJobStatus(jobId);
        setJobStatus(status);

        if (status.status === 'completed') {
          setExecuting(false);
          clearInterval(interval);
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          setExecuting(false);
          setError(status.error || 'Training failed');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Failed to get job status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, executing]);

  const handleRunPlaybook = async () => {
    setLoading(true);
    setError(null);

    try {
      // Run the playbook via the API
      const paramsPayload = {
        gdm_job_id: gdmJobId,
        source: 'gdm',
        source_config: {
          job_id: gdmJobId,
          table_name: overrides?.target_table ?? playbook.defaults?.target_table,
        },
        target_table: overrides?.target_table ?? playbook.defaults?.target_table,
        target_column: overrides?.target_column ?? playbook.defaults?.target_column,
        task: overrides?.task ?? playbook.defaults?.task,
        metric: overrides?.metric ?? playbook.defaults?.metric,
        time_limit_minutes: overrides?.time_limit_minutes ?? playbook.defaults?.time_limit_minutes,
        excluded_columns: overrides?.excluded_columns ?? overrides?.forbidden_columns ?? [],
        preset: overrides?.preset ?? undefined,
        ...(overrides || {}),
      };

      const response = await apiClient.runPlaybook({
        playbook_id: playbook.id,
        params: paramsPayload,
      });

      if (response.status === 'failed') {
        setError(response.error || 'Failed to start training');
        return;
      }

      if (response.job_id) {
        setJobId(response.job_id);
        setExecuting(true);
        onJobLaunched?.(response.job_id);
      }
    } catch (err: any) {
      let message = 'Failed to run playbook';

      if (err?.response?.data) {
        const errorData = err.response.data;

        // Handle string error detail
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        }
        // Handle object error detail (from HTTPException with dict)
        else if (typeof errorData.detail === 'object' && errorData.detail !== null) {
          const detail = errorData.detail;

          // Extract error message from nested structure
          if (detail.error) {
            message = detail.error;
          }
          // Handle validation errors
          else if (detail.validation_errors && Array.isArray(detail.validation_errors)) {
            message = `Validation failed: ${detail.validation_errors.join(', ')}`;
          }
          // Handle validation object with errors array
          else if (detail.validation?.errors && Array.isArray(detail.validation.errors)) {
            message = `Validation failed: ${detail.validation.errors.join(', ')}`;
          }
          // Fallback to JSON stringify if we have an object but can't extract a string
          else {
            message = JSON.stringify(detail);
          }
        }
        // Direct error field
        else if (errorData.error) {
          message = errorData.error;
        }
      }
      // Fallback to error message
      else if (err.message) {
        message = err.message;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Show training progress
  if (executing && jobStatus) {
    const progressColor =
      jobStatus.progress_pct < 30 ? 'info' :
      jobStatus.progress_pct < 70 ? 'primary' :
      jobStatus.progress_pct < 90 ? 'secondary' : 'success';

    return (
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 3,
          borderColor: alpha(theme.palette[progressColor].main, 0.5),
          background:
            theme.palette.mode === 'dark'
              ? `linear-gradient(145deg, rgba(16,22,26,0.96), rgba(12,18,22,0.9)), radial-gradient(circle at 20% 30%, ${alpha(theme.palette[progressColor].main, 0.15)}, transparent 50%)`
              : `linear-gradient(145deg, #f9fafb, #f3f4f6), radial-gradient(circle at 20% 30%, ${alpha(theme.palette[progressColor].main, 0.08)}, transparent 50%)`,
        }}
      >
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip color="primary" label="Step 3" size="small" />
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ModelTrainingIcon color={progressColor} />
                AutoML Training in Progress
              </Typography>
            </Box>
            <Chip
              label={`${jobStatus.progress_pct}%`}
              color={progressColor}
              sx={{ fontWeight: 600, fontSize: '0.9rem', minWidth: 60 }}
            />
          </Box>

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {jobStatus.current_step}
              </Typography>
              {jobStatus.estimated_remaining && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TimerIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    ~{Math.round(jobStatus.estimated_remaining / 60)} min remaining
                  </Typography>
                </Box>
              )}
            </Box>
            <LinearProgress
              variant="determinate"
              value={jobStatus.progress_pct}
              color={progressColor}
              sx={{
                height: 10,
                borderRadius: 5,
                '& .MuiLinearProgress-bar': {
                  borderRadius: 5,
                  transition: 'transform 0.4s ease',
                }
              }}
            />
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                  <SpeedIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Progress
                  </Typography>
                </Box>
                <Typography variant="h5" color={progressColor + '.main'}>
                  {jobStatus.progress_pct}%
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                  <ModelTrainingIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Models
                  </Typography>
                </Box>
                <Typography variant="h5">
                  {jobStatus.models_trained}
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                  Best Model
                </Typography>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {jobStatus.best_model || '-'}
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                  <TrendingUpIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Best Score
                  </Typography>
                </Box>
                <Typography variant="h5" color="success.main">
                  {jobStatus.best_score !== null
                    ? (jobStatus.best_score * 100).toFixed(1) + '%'
                    : '-'}
                </Typography>
              </Card>
            </Grid>
          </Grid>

          {jobStatus.log_messages && jobStatus.log_messages.length > 0 && (
            <Box
              sx={{
                p: 1.5,
                bgcolor: alpha(theme.palette.background.paper, 0.5),
                borderRadius: 2,
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5} fontWeight={600}>
                Training Log
              </Typography>
              {jobStatus.log_messages.slice(-5).map((msg, idx) => (
                <Typography
                  key={idx}
                  variant="caption"
                  display="block"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    opacity: 0.7 + (idx / jobStatus.log_messages.length) * 0.3
                  }}
                >
                  {msg}
                </Typography>
              ))}
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} thickness={5} />
            <Typography variant="body2" color="text.secondary">
              Training started {Math.floor(jobStatus.elapsed_seconds / 60)}m {jobStatus.elapsed_seconds % 60}s ago
            </Typography>
          </Box>
        </Stack>
      </Paper>
    );
  }

  // Show success state
  if (jobStatus?.status === 'completed') {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
          borderColor: alpha(theme.palette.success.main, 0.3),
        }}
      >
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h6">Training Complete!</Typography>
              <Typography variant="body2" color="text.secondary">
                Your AutoML model has been trained successfully
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Best Model
              </Typography>
              <Typography variant="h6">{jobStatus.best_model}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Accuracy
              </Typography>
              <Typography variant="h6" color="success.main">
                {jobStatus.best_score !== null
                  ? (jobStatus.best_score * 100).toFixed(1) + '%'
                  : '-'}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Models Trained
              </Typography>
              <Typography variant="h6">{jobStatus.models_trained}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Training Time
              </Typography>
              <Typography variant="h6">
                {Math.round(jobStatus.elapsed_seconds / 60)} min
              </Typography>
            </Grid>
          </Grid>
        </Stack>
      </Paper>
    );
  }

  // Show run button
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 3,
        borderColor:
          theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.28)',
        background:
          theme.palette.mode === 'dark'
            ? 'linear-gradient(145deg, rgba(16,22,26,0.96), rgba(12,18,22,0.9)), radial-gradient(circle at 14% 18%, rgba(59,130,246,0.24), transparent 38%)'
            : 'linear-gradient(145deg, #f7f9fb, #eff3f8)',
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip color="primary" label="Step 3" size="small" />
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Run AutoML Training
            <RocketLaunchIcon color="primary" fontSize="small" />
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Execute the generated playbook "{playbook.name}" to train your AutoML model using AutoGluon.
        </Typography>

        {playbook.defaults && (
          <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Playbook Configuration
              </Typography>
              <Stack spacing={0.5}>
                {playbook.defaults.target_table && (
                  <Typography variant="body2">
                    <strong>Table:</strong> {playbook.defaults.target_table}
                  </Typography>
                )}
                {playbook.defaults.target_column && (
                  <Typography variant="body2">
                    <strong>Target Column:</strong> {playbook.defaults.target_column}
                  </Typography>
                )}
                {playbook.defaults.task && (
                  <Typography variant="body2">
                    <strong>Task:</strong> {playbook.defaults.task}
                  </Typography>
                )}
                {playbook.defaults.metric && (
                  <Typography variant="body2">
                    <strong>Metric:</strong> {playbook.defaults.metric}
                  </Typography>
                )}
                {playbook.defaults.time_limit_minutes && (
                  <Typography variant="body2">
                    <strong>Time Budget:</strong> {playbook.defaults.time_limit_minutes} minutes
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            size="large"
            color="primary"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleRunPlaybook}
            disabled={loading}
            sx={{ px: 4 }}
          >
            {loading ? 'Starting Training...' : 'Run Playbook'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
};

export default PlaybookExecutor;
