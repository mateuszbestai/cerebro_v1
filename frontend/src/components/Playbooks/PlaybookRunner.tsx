import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useDispatch, useSelector } from 'react-redux';
import { Link as RouterLink } from 'react-router-dom';
import { apiClient } from '../../services/api';
import { automlApi } from '../../services/automlApi';
import { RootState } from '../../store';
import {
  clearJob,
  setError,
  setLoading,
  setPlaybooks,
  setSelectedPlaybook,
} from '../../store/playbooksSlice';
import { Playbook } from '../../types';
import { AutoMLStartRequest, Preset, TaskType } from '../../types/automl';
import { loadLastGdmJob } from '../../utils/gdmStorage';
import { useAssistant } from '../../contexts/AssistantContext';

interface Props {
  compact?: boolean;
  gdmJobId?: string;
  prefillTarget?: { table?: string; column?: string; task?: string };
  onJobLaunched?: (jobId: string) => void;
}

const PlaybookRunner: React.FC<Props> = ({ compact, gdmJobId, prefillTarget, onJobLaunched }) => {
  const dispatch = useDispatch();
  const { setGdmJobId, setAutomlJobId, setAutomlStatus } = useAssistant();
  const { playbooks, loading, selectedPlaybook, error } = useSelector(
    (state: RootState) => state.playbooks
  );

  const [open, setOpen] = useState(false);
  const [gdmPromptOpen, setGdmPromptOpen] = useState(false);
  const [resolvedGdmJobId, setResolvedGdmJobId] = useState<string | undefined>(
    () => gdmJobId || loadLastGdmJob()?.jobId
  );
  const [task, setTask] = useState<TaskType>('classification');
  const [preset, setPreset] = useState<Preset>('balanced');
  const [targetColumn, setTargetColumn] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [metric, setMetric] = useState('AUC_weighted');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(45);

  const ensureGdmContext = () => {
    const latest = gdmJobId || resolvedGdmJobId || loadLastGdmJob()?.jobId;
    if (latest) {
      setResolvedGdmJobId(latest);
      setGdmJobId(latest);
      return latest;
    }
    return null;
  };

  const sortedPlaybooks = useMemo(
    () => [...playbooks].sort((a, b) => a.name.localeCompare(b.name)),
    [playbooks]
  );

  useEffect(() => {
    if (gdmJobId) {
      setResolvedGdmJobId(gdmJobId);
      setGdmJobId(gdmJobId);
    }
  }, [gdmJobId, setGdmJobId]);

  useEffect(() => {
    if (open && playbooks.length === 0) {
      dispatch(setLoading(true));
      apiClient
        .listPlaybooks()
        .then((data) => dispatch(setPlaybooks(data)))
        .catch((err) => dispatch(setError(err.message || 'Failed to load playbooks')))
      .finally(() => dispatch(setLoading(false)));
    }
  }, [open, playbooks.length, dispatch]);

  useEffect(() => {
    if (!selectedPlaybook) {
      return;
    }
    const defaults = selectedPlaybook.defaults || {};
    if (defaults.target_column) {
      setTargetColumn(defaults.target_column);
    }
    if (defaults.target_table) {
      setTargetTable(defaults.target_table);
    }
    if (defaults.metric) {
      setMetric(defaults.metric);
    }
    if (defaults.time_limit_minutes) {
      setTimeLimitMinutes(defaults.time_limit_minutes);
    }
    if (defaults.task) {
      setTask(defaults.task as TaskType);
    }
  }, [selectedPlaybook]);

  useEffect(() => {
    if (prefillTarget?.table) {
      setTargetTable(prefillTarget.table);
    }
    if (prefillTarget?.column) {
      setTargetColumn(prefillTarget.column);
    }
    if (prefillTarget?.task) {
      setTask(prefillTarget.task as TaskType);
    }
  }, [prefillTarget?.table, prefillTarget?.column, prefillTarget?.task]);

  const handleOpen = () => {
    const latestGdm = ensureGdmContext();
    if (!latestGdm) {
      setGdmPromptOpen(true);
      return;
    }
    setOpen(true);
  };
  const handleClose = () => {
    setOpen(false);
    dispatch(clearJob());
    dispatch(setSelectedPlaybook(undefined));
  };

  const handleRun = async () => {
    if (!selectedPlaybook) return;
    const latestGdm = ensureGdmContext();
    if (!latestGdm) {
      dispatch(setError('Build a Global Data Model before running a playbook.'));
      return;
    }
    if (!targetTable || !targetColumn) {
      dispatch(setError('Target table and target column are required.'));
      return;
    }
    dispatch(setError(undefined));
    dispatch(setLoading(true));
    try {
      const payload: AutoMLStartRequest = {
        task: (task as TaskType) || 'classification',
        target_column: targetColumn,
        source: 'gdm',
        source_config: {
          job_id: latestGdm,
          table_name: targetTable,
        },
        preset,
        eval_metric: metric,
        time_limit: timeLimitMinutes ? timeLimitMinutes * 60 : undefined,
        job_name: `${selectedPlaybook.id}-autogluon`,
        tags: {
          playbook_id: selectedPlaybook.id,
          playbook_name: selectedPlaybook.name,
          domain: selectedPlaybook.domain || 'playbook',
        },
      };
      const response = await automlApi.startJob(payload);
      if (response.error || !response.job_id) {
        throw new Error(response.error || 'Failed to start AutoML');
      }
      setAutomlJobId(response.job_id);
      setAutomlStatus('training');
      setGdmJobId(latestGdm);
      onJobLaunched?.(response.job_id);
      setOpen(false);
    } catch (err: any) {
      const message = err?.response?.data?.detail || err.message || 'Failed to start playbook';
      dispatch(setError(message));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const renderPlaybookCard = (pb: Playbook) => (
    <Paper
      key={pb.id}
      variant={selectedPlaybook?.id === pb.id ? 'elevation' : 'outlined'}
      sx={{
        p: 2,
        borderColor: selectedPlaybook?.id === pb.id ? 'primary.main' : 'divider',
        cursor: 'pointer',
      }}
      onClick={() => dispatch(setSelectedPlaybook(pb))}
    >
      <Typography variant="subtitle1">{pb.name}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {pb.description}
      </Typography>
      {pb.domain && (
        <Typography variant="caption" color="text.secondary">
          Domain: {pb.domain}
        </Typography>
      )}
    </Paper>
  );

  return (
    <>
      <Button
        size={compact ? 'small' : 'medium'}
        variant="outlined"
        startIcon={<AutoAwesomeIcon />}
        onClick={handleOpen}
      >
        Run Playbook
      </Button>

      <Dialog open={gdmPromptOpen} onClose={() => setGdmPromptOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Build a Global Data Model first</DialogTitle>
        <DialogContent dividers>
          <Typography gutterBottom>
            Playbooks are tailored to your database. Create a Global Data Model so the AI can understand entities,
            relationships, and candidates for prediction targets.
          </Typography>
          <Alert severity="info">
            Go to the Database workspace and run "Prepare a Global Data Model" to unlock playbook generation.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGdmPromptOpen(false)}>Maybe later</Button>
          <Button
            component={RouterLink}
            to="/database"
            variant="contained"
            onClick={() => setGdmPromptOpen(false)}
          >
            Open GDM builder
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Playbooks</DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} md={5}>
              <Stack spacing={1.5} sx={{ maxHeight: 420, overflow: 'auto', pr: 1 }}>
                {sortedPlaybooks.map(renderPlaybookCard)}
                {sortedPlaybooks.length === 0 && !loading && (
                  <Typography color="text.secondary">No playbooks available.</Typography>
                )}
              </Stack>
            </Grid>
            <Grid item xs={12} md={7}>
              {!selectedPlaybook ? (
                <Typography color="text.secondary">Select a playbook to configure AutoML.</Typography>
              ) : (
                <Stack spacing={2}>
                  <Typography variant="h6">{selectedPlaybook.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    AutoGluon will train against your Global Data Model using this playbook&apos;s defaults.
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    GDM Job: {resolvedGdmJobId || 'Not found'}
                  </Typography>
                  <TextField
                    label="Target table"
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder={selectedPlaybook.defaults?.target_table || 'sales, customers, etc.'}
                    required
                    helperText="Use the table recommended in GDM (schema.table)."
                  />
                  <TextField
                    label="Target column"
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    fullWidth
                    size="small"
                    required
                  />
                  <TextField
                    label="Task"
                    value={task}
                    onChange={(e) => setTask(e.target.value as TaskType)}
                    select
                    size="small"
                    helperText="Choose the prediction type"
                  >
                    {['classification', 'regression'].map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt === 'classification' ? 'Classification (categorical target)' : 'Regression (numeric target)'}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Preset"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as Preset)}
                    select
                    size="small"
                    helperText="Controls AutoGluon search depth and speed"
                  >
                    {['quick', 'balanced', 'thorough'].map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt === 'quick' && 'Quick (5 min)'}
                        {opt === 'balanced' && 'Balanced (15 min)'}
                        {opt === 'thorough' && 'Thorough (60 min)'}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Primary metric"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    select
                    size="small"
                  >
                    {(task === 'regression'
                      ? ['r2_score', 'rmse', 'mae', 'mape']
                      : ['AUC_weighted', 'accuracy', 'f1', 'log_loss']
                    ).map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Time budget (minutes)"
                    type="number"
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                    size="small"
                    inputProps={{ min: 5, max: 120 }}
                  />
                </Stack>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            disabled={!selectedPlaybook || loading || !targetTable || !targetColumn || !resolvedGdmJobId}
            onClick={handleRun}
          >
            Start AutoML
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PlaybookRunner;
