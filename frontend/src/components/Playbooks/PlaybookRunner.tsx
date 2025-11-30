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
import { RootState } from '../../store';
import {
  clearJob,
  setActiveJob,
  setError,
  setJobStatus,
  setLoading,
  setPlaybooks,
  setSelectedPlaybook,
} from '../../store/playbooksSlice';
import { addResult } from '../../store/analysisSlice';
import { AutoMLJobStatus, Playbook } from '../../types';
import AutoMLStatus from './AutoMLStatus';
import { loadLastGdmJob } from '../../utils/gdmStorage';

interface Props {
  compact?: boolean;
}

const PlaybookRunner: React.FC<Props> = ({ compact }) => {
  const dispatch = useDispatch();
  const { playbooks, loading, selectedPlaybook, activeJobId, jobStatus, error } = useSelector(
    (state: RootState) => state.playbooks
  );

  const [open, setOpen] = useState(false);
  const [gdmPromptOpen, setGdmPromptOpen] = useState(false);
  const [trainingData, setTrainingData] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [metric, setMetric] = useState('AUC_weighted');
  const [timeLimit, setTimeLimit] = useState(30);

  const sortedPlaybooks = useMemo(
    () => [...playbooks].sort((a, b) => a.name.localeCompare(b.name)),
    [playbooks]
  );

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
      setTimeLimit(defaults.time_limit_minutes);
    }
  }, [selectedPlaybook]);

  useEffect(() => {
    if (!activeJobId) return;
    const interval = setInterval(async () => {
      try {
        const status = await apiClient.getAutomlJob(activeJobId);
        dispatch(setJobStatus(status as AutoMLJobStatus));
        const normalized = status.status ? status.status.toLowerCase() : '';
        if (normalized === 'completed' || normalized === 'failed') {
          clearInterval(interval);
          if (normalized === 'completed') {
            dispatch(
              addResult({
                query: selectedPlaybook ? `Playbook: ${selectedPlaybook.name}` : 'Playbook run',
                intent: { type: 'playbook' } as any,
                response: status.summary || 'AutoML job completed',
                statistics: status.metrics,
                timestamp: new Date().toISOString(),
              })
            );
          }
        }
      } catch (err: any) {
        dispatch(setError(err.message || 'Failed to fetch job status'));
        clearInterval(interval);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeJobId, dispatch, selectedPlaybook]);

  const handleOpen = () => {
    const latestGdm = loadLastGdmJob();
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
    if (!trainingData || !targetColumn) {
      dispatch(setError('Training data URI and target column are required.'));
      return;
    }
    dispatch(setError(undefined));
    dispatch(setLoading(true));
    try {
      const response = await apiClient.runPlaybook({
        playbook_id: selectedPlaybook.id,
        params: {
          training_data: trainingData,
          target_column: targetColumn,
          target_table: targetTable || undefined,
          metric,
          time_limit_minutes: timeLimit,
        },
      });
      dispatch(setActiveJob(response.job_id));
      dispatch(setJobStatus(undefined));
    } catch (err: any) {
      dispatch(setError(err.message || 'Failed to start playbook'));
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
                  {selectedPlaybook.defaults?.task && (
                    <Typography variant="body2" color="text.secondary">
                      Suggested task: {selectedPlaybook.defaults.task}
                    </Typography>
                  )}
                  <TextField
                    label="Training data URI (Azure Blob/Datastore)"
                    value={trainingData}
                    onChange={(e) => setTrainingData(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="azureml://datastores/..../paths/data.csv"
                  />
                  <TextField
                    label="Target table (optional)"
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder={selectedPlaybook.defaults?.target_table || 'sales, customers, etc.'}
                  />
                  <TextField
                    label="Target column"
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Primary metric"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    select
                    size="small"
                  >
                    {['AUC_weighted', 'accuracy', 'f1_score_weighted', 'normalized_root_mean_squared_error'].map(
                      (opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}
                        </MenuItem>
                      )
                    )}
                  </TextField>
                  <TextField
                    label="Time budget (minutes)"
                    type="number"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(Number(e.target.value))}
                    size="small"
                    inputProps={{ min: 5, max: 120 }}
                  />
                  <AutoMLStatus status={jobStatus} />
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
            disabled={!selectedPlaybook || loading}
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
