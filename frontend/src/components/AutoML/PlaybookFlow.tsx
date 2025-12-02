import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReviewsIcon from '@mui/icons-material/Reviews';
import ShieldIcon from '@mui/icons-material/Shield';
import InfoIcon from '@mui/icons-material/Info';

import { automlApi } from '../../services/automlApi';
import { gdmApi } from '../../services/gdmApi';
import { Playbook } from '../../types';
import {
  GDMAutoMLGuidance,
  PlaybookValidateResponse,
} from '../../types/automl';
import { loadLastGdmJob } from '../../utils/gdmStorage';
import { useAssistant } from '../../contexts/AssistantContext';
import PlaybookExecutor from '../Playbooks/PlaybookExecutor';
import AIForecastsPanel from '../Assistant/AIForecastsPanel';

const STEPS = [
  'GDM Results & Recommendations',
  'Playbook Review',
  'Run AutoML + Results',
];

const PlaybookFlow: React.FC = () => {
  const {
    gdmJobId,
    setGdmJobId,
    automlJobId,
    automlStatus,
  } = useAssistant();

  const [guidance, setGuidance] = useState<GDMAutoMLGuidance | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [overrides, setOverrides] = useState<Record<string, any>>({
    target_table: '',
    target_column: '',
    metric: '',
    time_limit_minutes: 45,
    excluded_columns: [],
  });
  const [validation, setValidation] = useState<PlaybookValidateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveGdmJob = useMemo(() => gdmJobId || loadLastGdmJob()?.jobId, [gdmJobId]);

  useEffect(() => {
    if (!effectiveGdmJob) return;
    setGdmJobId(effectiveGdmJob);
    setLoading(true);
    Promise.all([gdmApi.getResults(effectiveGdmJob), automlApi.listPlaybooks()])
      .then(([gdmResults, playbookList]) => {
        setGuidance(gdmResults.automl_guidance || null);
        setPlaybooks(playbookList);
        if (!selectedPlaybook && playbookList.length > 0) {
          setSelectedPlaybook(playbookList[0]);
          const defaults = playbookList[0].defaults || {};
          setOverrides((prev) => ({
            ...prev,
            target_table: defaults.target_table || '',
            target_column: defaults.target_column || '',
            metric: defaults.metric || '',
            time_limit_minutes: defaults.time_limit_minutes || prev.time_limit_minutes,
          }));
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || err.message || 'Failed to load playbooks or GDM results');
      })
      .finally(() => setLoading(false));
  }, [effectiveGdmJob, selectedPlaybook, setGdmJobId]);

  const handleOverrideChange = (field: string, value: any) => {
    setOverrides((prev) => ({
      ...prev,
      [field]: value,
    }));
    setValidation(null);
  };

  const handleSelectPlaybook = (pb: Playbook) => {
    setSelectedPlaybook(pb);
    const defaults = pb.defaults || {};
    setOverrides((prev) => ({
      ...prev,
      target_table: defaults.target_table || prev.target_table,
      target_column: defaults.target_column || prev.target_column,
      metric: defaults.metric || prev.metric,
      time_limit_minutes: defaults.time_limit_minutes || prev.time_limit_minutes,
    }));
    setValidation(null);
  };

  const runValidation = async () => {
    if (!selectedPlaybook) return;
    setValidating(true);
    setValidation(null);
    try {
      const response = await automlApi.validatePlaybook({
        playbook_id: selectedPlaybook.id,
        params: {
          ...overrides,
          gdm_job_id: effectiveGdmJob,
          target_table: overrides.target_table || selectedPlaybook.defaults?.target_table,
          target_column: overrides.target_column || selectedPlaybook.defaults?.target_column,
          metric: overrides.metric || selectedPlaybook.defaults?.metric,
        },
      });
      setValidation(response);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const jsonPreview = useMemo(() => {
    if (!selectedPlaybook) return null;
    return {
      ...selectedPlaybook,
      steps: [
        {
          type: 'automl',
          params: {
            ...(selectedPlaybook.defaults || {}),
            ...overrides,
            gdm_job_id: effectiveGdmJob,
          },
        },
      ],
    };
  }, [selectedPlaybook, overrides, effectiveGdmJob]);

  const recommendedTargets = guidance?.recommended_targets || [];
  const recommendationMessage = guidance?.recommendation_message;

  return (
    <Stack spacing={2}>
      <Stepper activeStep={selectedPlaybook ? (automlStatus === 'completed' ? 2 : 1) : 0} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!effectiveGdmJob && (
        <Alert severity="info" icon={<InfoIcon />}>
          Build a Global Data Model first. Once it finishes, recommended playbooks and AutoML will unlock here.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Stack spacing={1.5}>
              <Box display="flex" alignItems="center" gap={1}>
                <ShieldIcon color="primary" fontSize="small" />
                <Typography variant="h6">Step 1 · GDM Results</Typography>
              </Box>
              {loading ? (
                <Box display="flex" justifyContent="center" py={3}>
                  <CircularProgress size={26} />
                </Box>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Recommended targets come straight from your Global Data Model analysis.
                  </Typography>
                  {recommendedTargets.length > 0 ? (
                    <Stack spacing={1}>
                      {recommendedTargets.slice(0, 3).map((rec) => (
                        <Paper
                          key={`${rec.table}-${rec.column}`}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderColor:
                              selectedPlaybook?.defaults?.target_column === rec.column
                                ? 'primary.main'
                                : 'divider',
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setOverrides((prev) => ({
                              ...prev,
                              target_table: rec.table,
                              target_column: rec.column,
                              task: rec.task,
                            }))
                          }
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography fontWeight={600}>
                              {rec.table}.{rec.column}
                            </Typography>
                            <Chip size="small" label={rec.task} color="primary" variant="outlined" />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {rec.reason}
                          </Typography>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Alert severity="info">
                      {recommendationMessage ||
                        'No automated recommendations yet. Select a playbook or adjust your GDM to include better targets.'}
                    </Alert>
                  )}
                  <Divider />
                  <Typography variant="subtitle2">Playbooks</Typography>
                  <Stack spacing={1}>
                    {playbooks.map((pb) => (
                      <Paper
                        key={pb.id}
                        variant={selectedPlaybook?.id === pb.id ? 'elevation' : 'outlined'}
                        sx={{
                          p: 1.25,
                          borderColor: selectedPlaybook?.id === pb.id ? 'primary.main' : 'divider',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleSelectPlaybook(pb)}
                      >
                        <Typography fontWeight={600}>{pb.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {pb.description}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Stack spacing={1.5}>
              <Box display="flex" alignItems="center" gap={1}>
                <ReviewsIcon color="primary" fontSize="small" />
                <Typography variant="h6">Step 2 · Playbook Review</Typography>
              </Box>
              {selectedPlaybook ? (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Adjust objective, target, budget, and exclusions. Validate to check schema and leakage.
                  </Typography>
                  <TextField
                    label="Target table"
                    size="small"
                    fullWidth
                    value={overrides.target_table}
                    onChange={(e) => handleOverrideChange('target_table', e.target.value)}
                  />
                  <TextField
                    label="Target column"
                    size="small"
                    fullWidth
                    value={overrides.target_column}
                    onChange={(e) => handleOverrideChange('target_column', e.target.value)}
                  />
                  <Stack direction="row" spacing={1}>
                    <TextField
                      label="Metric"
                      size="small"
                      fullWidth
                      value={overrides.metric}
                      onChange={(e) => handleOverrideChange('metric', e.target.value)}
                    />
                    <TextField
                      label="Time budget (min)"
                      size="small"
                      type="number"
                      value={overrides.time_limit_minutes}
                      onChange={(e) =>
                        handleOverrideChange('time_limit_minutes', Number(e.target.value) || 0)
                      }
                    />
                  </Stack>
                  <TextField
                    label="Excluded / forbidden columns"
                    size="small"
                    fullWidth
                    helperText="Comma separated list"
                    value={(overrides.excluded_columns || []).join(', ')}
                    onChange={(e) =>
                      handleOverrideChange(
                        'excluded_columns',
                        e.target.value
                          .split(',')
                          .map((c) => c.trim())
                          .filter(Boolean)
                      )
                    }
                  />
                  <Button
                    variant="outlined"
                    startIcon={<FactCheckIcon />}
                    onClick={runValidation}
                    disabled={validating}
                  >
                    {validating ? 'Validating…' : 'Validate Playbook'}
                  </Button>
                  {validation && (
                    <Stack spacing={1}>
                      <Alert severity={validation.valid ? 'success' : 'error'}>
                        {validation.valid ? 'Playbook is ready for AutoML.' : 'Validation failed.'}
                      </Alert>
                      {validation.errors?.length > 0 && (
                        <Alert
                          severity="error"
                          sx={{
                            '& .MuiAlert-message': {
                              width: '100%',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                            },
                          }}
                        >
                          <Stack spacing={0.5}>
                            {validation.errors.map((error, idx) => (
                              <Typography key={idx} variant="body2" component="div">
                                • {error}
                              </Typography>
                            ))}
                          </Stack>
                        </Alert>
                      )}
                      {validation.warnings?.length > 0 && (
                        <Alert
                          severity="warning"
                          sx={{
                            '& .MuiAlert-message': {
                              width: '100%',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                            },
                          }}
                        >
                          <Stack spacing={0.5}>
                            {validation.warnings.map((warning, idx) => (
                              <Typography key={idx} variant="body2" component="div">
                                • {warning}
                              </Typography>
                            ))}
                          </Stack>
                        </Alert>
                      )}
                    </Stack>
                  )}
                  {jsonPreview && (
                    <Box
                      sx={{
                        mt: 1,
                        p: 1.5,
                        bgcolor: 'grey.900',
                        color: 'grey.100',
                        borderRadius: 1,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      <Typography variant="caption" color="grey.400">
                        Playbook JSON
                      </Typography>
                      <pre style={{ margin: 0, fontSize: 12 }}>
                        {JSON.stringify(jsonPreview, null, 2)}
                      </pre>
                    </Box>
                  )}
                </>
              ) : (
                <Alert severity="info" icon={<AutoAwesomeIcon />}>
                  Select a playbook to review its settings.
                </Alert>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Box display="flex" alignItems="center" gap={1}>
                <PlayArrowIcon color="primary" fontSize="small" />
                <Typography variant="h6">Step 3 · Run AutoML</Typography>
              </Box>
              {!selectedPlaybook || !effectiveGdmJob ? (
                <Alert severity="info">
                  Choose a playbook and ensure a Global Data Model exists to start training.
                </Alert>
              ) : (
                <>
                  <PlaybookExecutor
                    playbook={selectedPlaybook}
                    gdmJobId={effectiveGdmJob}
                    overrides={overrides}
                    onJobLaunched={(jobId) => {
                      setValidation(null);
                      setError(null);
                      if (!automlJobId) {
                        // Assistant context handles status polling elsewhere
                      }
                    }}
                  />
                  {automlStatus === 'completed' && automlJobId && (
                    <>
                      <Divider />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Results Dashboard
                      </Typography>
                      <AIForecastsPanel />
                    </>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
};

export default PlaybookFlow;
