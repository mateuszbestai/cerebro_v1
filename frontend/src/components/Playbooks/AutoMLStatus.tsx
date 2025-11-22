import React from 'react';
import { Alert, Box, Chip, LinearProgress, Paper, Typography } from '@mui/material';
import { AutoMLJobStatus } from '../../types';

interface Props {
  status?: AutoMLJobStatus;
}

const AutoMLStatus: React.FC<Props> = ({ status }) => {
  if (!status) return null;

  const isComplete = status.status?.toLowerCase() === 'completed';
  const isFailed = status.status?.toLowerCase() === 'failed';

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle1">AutoML Job</Typography>
        <Chip
          label={status.status}
          color={isComplete ? 'success' : isFailed ? 'error' : 'primary'}
          size="small"
        />
      </Box>
      {!isComplete && !isFailed && <LinearProgress sx={{ mb: 2 }} />}
      {status.summary && (
        <Typography variant="body2" color="text.primary" sx={{ mb: 1 }}>
          {status.summary}
        </Typography>
      )}
      {status.metrics && Object.keys(status.metrics).length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Metrics
          </Typography>
          {Object.entries(status.metrics).map(([key, value]) => (
            <Typography key={key} variant="body2">
              {key}: {String(value)}
            </Typography>
          ))}
        </Box>
      )}
      {status.error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {status.error}
        </Alert>
      )}
    </Paper>
  );
};

export default AutoMLStatus;
