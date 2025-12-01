/**
 * Training Step - Real-time Progress Tracking
 *
 * Shows live training progress with:
 * - Circular progress indicator
 * - Current step description
 * - Model leaderboard (as models are trained)
 * - Activity log
 * - Time estimation
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Alert,
  Stepper,
  Step,
  StepLabel,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

import { automlApi } from '../../../services/automlApi';
import { AutoMLStatusResponse } from '../../../types/automl';

interface TrainingStepProps {
  jobId: string;
  onComplete: (jobId: string) => void;
  onCancel: () => void;
}

const POLL_INTERVAL = 2000; // 2 seconds

const TRAINING_STEPS = [
  { label: 'Loading Data', key: 'preparing' },
  { label: 'Preprocessing', key: 'preprocessing' },
  { label: 'Training Models', key: 'training' },
  { label: 'Evaluating', key: 'evaluating' },
  { label: 'Complete', key: 'completed' },
];

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
};

const getStepIndex = (status: string, currentStep: string): number => {
  const step = currentStep.toLowerCase();
  if (status === 'completed') return 4;
  if (status === 'failed' || status === 'cancelled') return -1;
  if (step.includes('load') || step.includes('prepar')) return 0;
  if (step.includes('preprocess')) return 1;
  if (step.includes('train')) return 2;
  if (step.includes('evaluat')) return 3;
  return 2; // Default to training
};

const TrainingStep: React.FC<TrainingStepProps> = ({ jobId, onComplete, onCancel }) => {
  const [status, setStatus] = useState<AutoMLStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const result = await automlApi.getJobStatus(jobId);
        setStatus(result);

        if (result.status === 'completed') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
          }
          onComplete(jobId);
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
          }
          setError(result.error || `Job ${result.status}`);
        }
      } catch (err: any) {
        console.error('Failed to poll status:', err);
        setError(err.response?.data?.detail || 'Failed to get job status');
      }
    };

    // Initial poll
    pollStatus();

    // Set up polling interval
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [jobId, onComplete]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await automlApi.cancelJob(jobId);
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
    setCancelling(false);
    onCancel();
  };

  const activeStep = status ? getStepIndex(status.status, status.current_step) : 0;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Training in Progress
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Your models are being trained. This may take a few minutes depending on your data size and configuration.
      </Typography>

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2">Training Failed</Typography>
          <Typography variant="body2">{error}</Typography>
          <Button variant="outlined" color="error" onClick={onCancel} sx={{ mt: 1 }}>
            Start Over
          </Button>
        </Alert>
      )}

      {/* Main Progress Section */}
      {!error && status && (
        <Grid container spacing={3}>
          {/* Progress Circle */}
          <Grid item xs={12} md={4}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress
                    variant="determinate"
                    value={status.progress_pct}
                    size={120}
                    thickness={4}
                    color={status.status === 'completed' ? 'success' : 'primary'}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="h4" color="text.primary">
                      {status.progress_pct}%
                    </Typography>
                  </Box>
                </Box>

                <Typography variant="h6" sx={{ mt: 2 }}>
                  {status.current_step}
                </Typography>

                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                  <Chip
                    icon={<AccessTimeIcon />}
                    label={`Elapsed: ${formatTime(status.elapsed_seconds)}`}
                    size="small"
                  />
                  {status.estimated_remaining && (
                    <Chip
                      label={`~${formatTime(status.estimated_remaining)} remaining`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Step Progress */}
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Progress
                </Typography>
                <Stepper activeStep={activeStep} orientation="vertical">
                  {TRAINING_STEPS.map((step, index) => (
                    <Step key={step.key} completed={index < activeStep}>
                      <StepLabel
                        StepIconProps={{
                          sx: {
                            color:
                              index < activeStep
                                ? 'success.main'
                                : index === activeStep
                                ? 'primary.main'
                                : 'text.disabled',
                          },
                        }}
                      >
                        {step.label}
                      </StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </CardContent>
            </Card>
          </Grid>

          {/* Best Model So Far */}
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Training Stats
                </Typography>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Models Trained
                  </Typography>
                  <Typography variant="h4">{status.models_trained}</Typography>
                </Box>

                {status.best_model && (
                  <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <EmojiEventsIcon color="warning" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2">Best So Far</Typography>
                    </Box>
                    <Typography variant="body1" fontWeight="bold">
                      {status.best_model}
                    </Typography>
                    {status.best_score !== null && (
                      <Typography variant="body2">
                        Score: {status.best_score.toFixed(4)}
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Activity Log */}
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Activity Log
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    maxHeight: 200,
                    overflow: 'auto',
                    bgcolor: 'grey.900',
                    p: 1,
                  }}
                >
                  <List dense>
                    {status.log_messages.slice(-20).map((msg, idx) => (
                      <ListItem key={idx} sx={{ py: 0 }}>
                        <ListItemText
                          primary={
                            <Typography
                              variant="body2"
                              fontFamily="monospace"
                              sx={{ color: 'grey.300' }}
                            >
                              {msg}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Loading State */}
      {!status && !error && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
          <CircularProgress />
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Cancel Button */}
      {!error && status?.status !== 'completed' && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={handleCancel}
            disabled={cancelling}
            startIcon={cancelling ? <CircularProgress size={16} /> : <CancelIcon />}
          >
            {cancelling ? 'Cancelling...' : 'Cancel Training'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default TrainingStep;
