/**
 * AutoML Wizard - Main Container
 *
 * A step-by-step wizard for non-technical business users to run AutoML.
 * Steps:
 * 1. Select Data Source
 * 2. Choose Target Column
 * 3. Configure Training
 * 4. Training Progress
 * 5. View Results
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';

import DataSelectionStep from './steps/DataSelectionStep';
import TargetSelectionStep from './steps/TargetSelectionStep';
import ConfigurationStep from './steps/ConfigurationStep';
import TrainingStep from './steps/TrainingStep';
import ResultsStep from './steps/ResultsStep';
import { automlApi } from '../../services/automlApi';
import {
  WizardState,
  TaskType,
  Preset,
  DataSource,
  SourceConfig,
  ColumnInfo,
  AutoMLStartRequest,
  GDMAutoMLGuidance,
} from '../../types/automl';

const STEPS = [
  { label: 'Select Data', description: 'Choose your data source' },
  { label: 'Choose Target', description: 'What do you want to predict?' },
  { label: 'Configure', description: 'Set training options' },
  { label: 'Training', description: 'Model training in progress' },
  { label: 'Results', description: 'View your trained model' },
];

const initialState: WizardState = {
  step: 0,
  dataSource: null,
  sourceConfig: null,
  selectedTable: null,
  targetColumn: null,
  task: 'classification',
  preset: 'balanced',
  excludedColumns: [],
  evalMetric: null,
  columns: [],
  previewData: [],
  jobId: null,
};

interface AutoMLWizardProps {
  gdmJobId?: string;
  gdmGuidance?: GDMAutoMLGuidance;
  onComplete?: (jobId: string) => void;
}

const AutoMLWizard: React.FC<AutoMLWizardProps> = ({
  gdmJobId,
  gdmGuidance,
  onComplete,
}) => {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<WizardState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);

  // Check service availability on mount
  useEffect(() => {
    const checkService = async () => {
      try {
        const status = await automlApi.getServiceStatus();
        setServiceAvailable(status.available);
        if (!status.available) {
          setError(status.message);
        }
      } catch (err) {
        setServiceAvailable(false);
        setError('Could not connect to AutoML service');
      }
    };
    checkService();
  }, []);

  // Initialize from GDM if provided
  useEffect(() => {
    if (gdmJobId && gdmGuidance) {
      const topTarget = gdmGuidance.recommended_targets?.[0];
      if (topTarget) {
        setState((prev) => ({
          ...prev,
          dataSource: 'gdm',
          sourceConfig: {
            job_id: gdmJobId,
            table_name: topTarget.table,
          },
          selectedTable: topTarget.table,
          targetColumn: topTarget.column,
          task: topTarget.task,
        }));
      }
    }
  }, [gdmJobId, gdmGuidance]);

  // Check URL params for resuming
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    if (jobId) {
      setState((prev) => ({
        ...prev,
        jobId,
        step: 3, // Go to training step
      }));
    }
  }, [searchParams]);

  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
    setError(null);
  }, []);

  const handleNext = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.min(prev.step + 1, STEPS.length - 1) }));
  }, []);

  const handleBack = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(prev.step - 1, 0) }));
  }, []);

  const handleDataSourceSelect = useCallback(
    (source: DataSource, config: SourceConfig, columns: ColumnInfo[], previewData: Record<string, any>[]) => {
      updateState({
        dataSource: source,
        sourceConfig: config,
        columns,
        previewData,
        selectedTable: 'table_name' in config ? config.table_name : null,
      });
      handleNext();
    },
    [updateState, handleNext]
  );

  const handleTargetSelect = useCallback(
    (column: string, task: TaskType, excludedColumns: string[]) => {
      updateState({
        targetColumn: column,
        task,
        excludedColumns,
      });
      handleNext();
    },
    [updateState, handleNext]
  );

  const startTraining = useCallback(async (preset: Preset, metric: string | null, timeLimit?: number) => {
    if (!state.dataSource || !state.sourceConfig || !state.targetColumn) {
      setError('Missing required configuration');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: AutoMLStartRequest = {
        task: state.task,
        target_column: state.targetColumn,
        source: state.dataSource,
        source_config: state.sourceConfig,
        preset,
        excluded_columns: state.excludedColumns,
        eval_metric: metric || undefined,
        time_limit: timeLimit,
        tags: gdmJobId ? { gdm_job_id: gdmJobId } : undefined,
      };

      const response = await automlApi.startJob(request);

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.job_id) {
        updateState({ jobId: response.job_id });
        handleNext(); // Go to training step
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start training');
    } finally {
      setLoading(false);
    }
  }, [state, updateState, handleNext, gdmJobId]);

  const handleConfigurationComplete = useCallback(
    (preset: Preset, metric: string | null, timeLimit?: number) => {
      updateState({
        preset,
        evalMetric: metric,
      });
      // Start training
      startTraining(preset, metric, timeLimit);
    },
    [updateState, startTraining]
  );

  const handleTrainingComplete = useCallback(
    (jobId: string) => {
      updateState({ jobId });
      handleNext(); // Go to results step
      if (onComplete) {
        onComplete(jobId);
      }
    },
    [updateState, handleNext, onComplete]
  );

  const handleReset = useCallback(() => {
    setState(initialState);
    setError(null);
  }, []);

  if (serviceAvailable === null) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (serviceAvailable === false) {
    return (
      <Box p={3}>
        <Alert severity="error">
          <Typography variant="h6">AutoML Service Unavailable</Typography>
          <Typography variant="body2">
            {error || 'The AutoML service is not available. Please ensure AutoGluon is installed.'}
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      {/* Stepper Header */}
      <Stepper activeStep={state.step} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((step, index) => (
          <Step key={step.label} completed={index < state.step}>
            <StepLabel
              optional={
                <Typography variant="caption" color="text.secondary">
                  {step.description}
                </Typography>
              }
            >
              {step.label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step Content */}
      <Paper elevation={0} sx={{ p: 3, minHeight: 400 }}>
        {state.step === 0 && (
          <DataSelectionStep
            gdmJobId={gdmJobId}
            gdmGuidance={gdmGuidance}
            initialSource={state.dataSource}
            initialConfig={state.sourceConfig}
            onSelect={handleDataSourceSelect}
          />
        )}

        {state.step === 1 && (
          <TargetSelectionStep
            columns={state.columns}
            previewData={state.previewData}
            gdmGuidance={gdmGuidance}
            selectedTable={state.selectedTable}
            initialTarget={state.targetColumn}
            initialTask={state.task}
            initialExcluded={state.excludedColumns}
            onSelect={handleTargetSelect}
            onBack={handleBack}
          />
        )}

        {state.step === 2 && (
          <ConfigurationStep
            task={state.task}
            targetColumn={state.targetColumn!}
            columns={state.columns}
            excludedColumns={state.excludedColumns}
            initialPreset={state.preset}
            initialMetric={state.evalMetric}
            loading={loading}
            onComplete={handleConfigurationComplete}
            onBack={handleBack}
          />
        )}

        {state.step === 3 && state.jobId && (
          <TrainingStep
            jobId={state.jobId}
            onComplete={handleTrainingComplete}
            onCancel={handleReset}
          />
        )}

        {state.step === 4 && state.jobId && (
          <ResultsStep
            jobId={state.jobId}
            task={state.task}
            targetColumn={state.targetColumn!}
            onNewTraining={handleReset}
          />
        )}
      </Paper>
    </Box>
  );
};

export default AutoMLWizard;
