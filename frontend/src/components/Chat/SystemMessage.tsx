/**
 * SystemMessage - Rich System Message Display
 *
 * Displays special system messages for events like:
 * - AutoML training complete
 * - Forecast ready
 * - Informational messages
 */

import React from 'react';
import {
  ListItem,
  Paper,
  Typography,
  Box,
  Button,
  Chip,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { Message as MessageType } from '../../types';
import { SystemMessageType } from '../../contexts/ChatContext';
import { useAssistant } from '../../contexts/AssistantContext';
import { useNavigate } from 'react-router-dom';

interface SystemMessageProps {
  message: MessageType;
}

const SystemMessage: React.FC<SystemMessageProps> = ({ message }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { setAutomlJobId, setAutomlStatus } = useAssistant();

  const systemType = (message.metadata?.system_type as SystemMessageType) || 'info';

  const goToAutomlSuite = () => {
    if (message.metadata?.job_id) {
      setAutomlJobId(message.metadata.job_id);
      setAutomlStatus('completed');
    }
    navigate('/solutions/automl');
  };

  // Get icon and color based on type
  const getTypeConfig = () => {
    switch (systemType) {
      case 'automl_complete':
        return {
          icon: <AutoGraphIcon />,
          color: theme.palette.success.main,
          bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
          title: 'AutoML Training Complete',
          action: 'View Results',
          onAction: goToAutomlSuite,
        };
      case 'forecast_ready':
        return {
          icon: <InsightsIcon />,
          color: theme.palette.info.main,
          bgcolor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
          title: 'AI Insights Ready',
          action: 'View Insights',
          onAction: goToAutomlSuite,
        };
      case 'success':
        return {
          icon: <CheckCircleIcon />,
          color: theme.palette.success.main,
          bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
          title: 'Success',
        };
      case 'warning':
        return {
          icon: <WarningIcon />,
          color: theme.palette.warning.main,
          bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
          title: 'Warning',
        };
      case 'error':
        return {
          icon: <ErrorIcon />,
          color: theme.palette.error.main,
          bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
          title: 'Error',
        };
      default:
        return {
          icon: <InfoIcon />,
          color: theme.palette.info.main,
          bgcolor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
          title: 'Info',
        };
    }
  };

  const config = getTypeConfig();

  return (
    <ListItem sx={{ justifyContent: 'center', p: 0 }}>
      <Paper
        elevation={0}
        sx={{
          width: '90%',
          maxWidth: 600,
          p: 2,
          bgcolor: config.bgcolor,
          border: `1px solid ${alpha(config.color, 0.3)}`,
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box
            sx={{
              color: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 0.5,
            }}
          >
            {config.icon}
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography
              variant="subtitle2"
              sx={{ color: config.color, fontWeight: 600, mb: 0.5 }}
            >
              {config.title}
            </Typography>

            <Typography variant="body2" sx={{ color: 'text.primary' }}>
              {message.content}
            </Typography>

            {/* Metadata chips */}
            {message.metadata && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                {message.metadata.best_model && (
                  <Chip
                    label={`Model: ${message.metadata.best_model}`}
                    size="small"
                    variant="outlined"
                  />
                )}
                {message.metadata.best_score !== undefined && (
                  <Chip
                    label={`Score: ${(message.metadata.best_score * 100).toFixed(1)}%`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
                {message.metadata.job_id && (
                  <Chip
                    label={`Job: ${message.metadata.job_id.slice(0, 8)}...`}
                    size="small"
                    variant="outlined"
                    sx={{ opacity: 0.7 }}
                  />
                )}
              </Box>
            )}

            {/* Action button */}
            {config.action && config.onAction && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  variant="outlined"
                  size="small"
                  endIcon={<ArrowForwardIcon />}
                  onClick={config.onAction}
                  sx={{
                    borderColor: alpha(config.color, 0.5),
                    color: config.color,
                    '&:hover': {
                      borderColor: config.color,
                      bgcolor: alpha(config.color, 0.1),
                    },
                  }}
                >
                  {config.action}
                </Button>
              </Box>
            )}
          </Box>
        </Box>

        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 1,
            textAlign: 'right',
            opacity: 0.6,
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </Typography>
      </Paper>
    </ListItem>
  );
};

export default SystemMessage;
