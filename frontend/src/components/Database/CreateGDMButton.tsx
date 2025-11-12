import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { Bolt, CheckCircleOutline, InfoOutlined, PlayArrow, SaveAltOutlined, TimerOutlined } from '@mui/icons-material';
import { gdmApi, GDMArtifact, GDMStatusResponse } from '../../services/gdmApi';
import { Link as RouterLink } from 'react-router-dom';

type ModelOption = 'gpt-5' | 'gpt-4.1';

interface CreateGDMButtonProps {
  dbId: string | null;
}

const modelDescriptions: Record<ModelOption, { title: string; subtitle: string; icon: React.ReactNode }> = {
  'gpt-5': {
    title: '🧠 Use GPT-5 (recommended)',
    subtitle: 'Best for deep schema analysis, glossary creation, and relationship inference.',
    icon: <CheckCircleOutline color="success" />,
  },
  'gpt-4.1': {
    title: '⚡ Use GPT-4.1 (faster)',
    subtitle: 'Good for light-weight schema previews and smaller datasets.',
    icon: <Bolt color="warning" />,
  },
};

const DEFAULT_POLL_INTERVAL = 3500;

const pipelineSteps: Record<
  string,
  {
    label: string;
    index: number;
  }
> = {
  queued: { label: 'Queued', index: 0 },
  metadata_harvest: { label: 'Harvesting metadata', index: 1 },
  profiling: { label: 'Profiling data', index: 2 },
  embeddings: { label: 'Computing embeddings and glossary candidates', index: 3 },
  relationship_inference: { label: 'Analyzing relationships', index: 4 },
  artifact_generation: { label: 'Preparing deliverables', index: 5 },
  completed: { label: 'Completed', index: 5 },
  failed: { label: 'Failed', index: 5 },
};

const CreateGDMButton: React.FC<CreateGDMButtonProps> = ({ dbId }) => {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption>('gpt-5');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<GDMStatusResponse | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = status ? status.status === 'running' : false;
  const buttonDisabled = !dbId || isSubmitting || isRunning;

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const pollStatus = async () => {
      if (cancelled) return;
      try {
        const response = await gdmApi.getStatus(jobId);
        if (!cancelled) {
          setStatus(response);
        }
        if (response.status === 'completed' || response.status === 'failed') {
          return;
        }
        if (!cancelled) {
          timeoutHandle = setTimeout(pollStatus, DEFAULT_POLL_INTERVAL);
        }
      } catch (pollError: any) {
        if (!cancelled) {
          setError(pollError?.response?.data?.detail || pollError.message || 'Unable to fetch status');
          timeoutHandle = setTimeout(pollStatus, DEFAULT_POLL_INTERVAL * 2);
        }
      }
    };

    pollStatus();
    return () => {
      cancelled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [jobId]);

  const startJob = async () => {
    if (!dbId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await gdmApi.create({
        database_id: dbId,
        model: selectedModel,
      });
      setWarnings(response.warnings || []);
      setJobId(response.job_id);
      setStatus({
        job_id: response.job_id,
        status: response.status,
        step: 'queued',
        progress: 0,
        message: 'Preparing to start',
        model_used: response.model_used,
        logs: [],
        warnings: response.warnings || [],
        artifacts: [],
      });
      setDialogOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to start GDM generation');
    } finally {
      setSubmitting(false);
    }
  };

  const latestLogs = useMemo(() => {
    if (!status?.logs) return [];
    return status.logs.slice(-5).reverse();
  }, [status]);

  const combinedWarnings = useMemo(() => {
    const merged = [...warnings, ...(status?.warnings || [])];
    return Array.from(new Set(merged));
  }, [warnings, status]);

  const importantArtifacts = useMemo(() => {
    if (!status?.artifacts) return [];
    const priority = ['global_model.json', 'model.mmd'];
    const prioritized: GDMArtifact[] = [];
    priority.forEach((name) => {
      const found = status.artifacts.find((artifact) => artifact.name === name);
      if (found) prioritized.push(found);
    });
    return prioritized;
  }, [status]);

  const renderArtifacts = () => {
    if (!status?.artifacts || status.artifacts.length === 0) {
      return null;
    }
    return (
      <Stack spacing={1} sx={{ mt: 2 }}>
        <Typography variant="subtitle2">Artifacts</Typography>
        {status.artifacts.map((artifact) => (
          <Button
            key={artifact.name}
            variant="outlined"
            color="primary"
            size="small"
            startIcon={<SaveAltOutlined />}
            component="a"
            href={gdmApi.getArtifactUrl(status.job_id, artifact.name)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download {artifact.name}
          </Button>
        ))}
      </Stack>
    );
  };

  const currentModelLabel = status?.model_used || selectedModel;
  const currentStep = status ? pipelineSteps[status.step] : null;

  return (
    <Box>
      <Tooltip title={!dbId ? 'Connect to a database to enable GDM generation' : ''}>
        <span>
          <Button
            variant="contained"
            color="secondary"
            fullWidth
            onClick={() => setDialogOpen(true)}
            disabled={buttonDisabled}
            startIcon={<PlayArrow />}
            sx={{ mb: 2 }}
          >
            {isRunning ? `Building global model with ${currentModelLabel}…` : 'Would you like to create a Global Data Model for this database?'}
          </Button>
        </span>
      </Tooltip>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {combinedWarnings.length > 0 && (
        <Alert severity="warning" icon={<InfoOutlined />} sx={{ mb: 2 }}>
          {combinedWarnings.map((warning) => (
            <Box key={warning}>{warning}</Box>
          ))}
        </Alert>
      )}

      {status && (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.background.paper,
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            {status.status === 'completed' ? (
              <CheckCircleOutline color="success" />
            ) : status.status === 'failed' ? (
              <InfoOutlined color="error" />
            ) : (
              <CircularProgress size={32} />
            )}
            <Box>
              <Typography variant="subtitle1">
                {status.status === 'completed'
                  ? 'Global data model created successfully!'
                  : status.status === 'failed'
                  ? 'Global data model failed'
                  : `Building global model with ${currentModelLabel}…`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {status.message}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={status.progress} />
            <Typography variant="caption" color="text.secondary">
              {`Building global model… step ${currentStep ? `${currentStep.index}/5` : '0/5'}`}
              {currentStep ? ` (${currentStep.label})` : ''} · {status.progress}% complete
            </Typography>
          </Box>

          {status.logs && status.logs.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Recent activity
              </Typography>
              <List dense>
                {latestLogs.map((log) => (
                  <ListItem key={`${log.timestamp}-${log.step}`}>
                    <ListItemIcon>
                      <TimerOutlined fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={log.message}
                      secondary={new Date(log.timestamp).toLocaleTimeString()}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {status.status === 'completed' && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={1}>
                <Typography variant="subtitle2" gutterBottom>
                  What&apos;s ready
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip label="✅ Entities discovered" color="success" />
                  <Chip label="✅ Relationships inferred" color="success" />
                  <Chip label="✅ Glossary created" color="success" />
                </Stack>
                {status.summary && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Entities: {status.summary.entity_count ?? '—'} · Relationships: {status.summary.relationship_count ?? '—'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Model used: {currentModelLabel.toUpperCase()}
                    </Typography>
                  </>
                )}
              </Stack>
              {importantArtifacts.length > 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Generated using {currentModelLabel}. Download the canonical files below.
                </Alert>
              )}
              {renderArtifacts()}
              <Button
                component={RouterLink}
                to={`/solutions/gdm/${status.job_id}/results`}
                variant="contained"
                color="secondary"
                sx={{ mt: 2 }}
              >
                Open Global Model Results
              </Button>
            </>
          )}
        </Box>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => (!isSubmitting ? setDialogOpen(false) : null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Prepare a Global Data Model</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1" gutterBottom>
            Creating a Global Data Model requires deep schema understanding and reasoning. GPT-5 is recommended for best results. Would you like to proceed with GPT-5 or use GPT-4.1 for faster execution?
          </Typography>

          <Stack spacing={2} sx={{ mt: 2 }}>
            {(Object.keys(modelDescriptions) as ModelOption[]).map((option) => {
              const descriptor = modelDescriptions[option];
              const isSelected = selectedModel === option;
              return (
                <Box
                  key={option}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedModel(option)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setSelectedModel(option);
                    }
                  }}
                  sx={{
                    border: `1px solid ${isSelected ? theme.palette.primary.main : theme.palette.divider}`,
                    borderRadius: 2,
                    p: 2,
                    cursor: 'pointer',
                    outline: 'none',
                    bgcolor: isSelected ? theme.palette.action.selected : 'transparent',
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    {descriptor.icon}
                    <Box>
                      <Typography variant="subtitle1">{descriptor.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {descriptor.subtitle}
                      </Typography>
                    </Box>
                    {isSelected && <Chip label="Selected" color="primary" size="small" />}
                  </Stack>
                </Box>
              );
            })}
          </Stack>

          <Alert severity="info" icon={<InfoOutlined />} sx={{ mt: 2 }}>
            This process analyzes every table, profiles column statistics, infers relationships, and assembles glossary + ER diagrams. It can take several minutes depending on database size.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={startJob}
            variant="contained"
            color="primary"
            disabled={!dbId || isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} /> : <PlayArrow />}
          >
            {isSubmitting ? 'Starting…' : `Start with ${selectedModel.toUpperCase()}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CreateGDMButton;
