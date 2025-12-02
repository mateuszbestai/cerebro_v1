import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LibraryAddCheckIcon from '@mui/icons-material/LibraryAddCheck';
import { useDispatch, useSelector } from 'react-redux';

import { apiClient, GeneratedPlaybookSummary } from '../../services/api';
import { AutomlTargetRecommendation, GDMResultsResponse } from '../../services/gdmApi';
import { RootState } from '../../store';
import { setPlaybooks } from '../../store/playbooksSlice';

interface Props {
  jobId: string;
  results?: GDMResultsResponse;
  onGenerated?: (playbook: GeneratedPlaybookSummary) => void;
  prefillTarget?: { table?: string; column?: string; task?: string };
}

const DEFAULT_TASK = 'classification';

const PlaybookFromGDM: React.FC<Props> = ({ jobId, results, onGenerated, prefillTarget }) => {
  const dispatch = useDispatch();
  const { playbooks } = useSelector((state: RootState) => state.playbooks);

  const [useCase, setUseCase] = useState('Predict churn for active subscribers');
  const [task, setTask] = useState(DEFAULT_TASK);
  const [targetTable, setTargetTable] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [metric, setMetric] = useState('AUC_weighted');
  const [timeLimit, setTimeLimit] = useState(45);
  const [maxTrials, setMaxTrials] = useState(12);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<GeneratedPlaybookSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recommendedTargets = useMemo(
    () => results?.automl_guidance?.recommended_targets || [],
    [results?.automl_guidance?.recommended_targets]
  );

  const businessObjectives = useMemo(() => {
    const templates: Record<string, string[]> = {
      'Subscription Lifecycle': [
        'Predict churn for active subscribers',
        'Forecast renewals for upcoming periods',
      ],
      'Customer 360': [
        'Upsell probability for existing customers',
        'Next best offer for active customers',
      ],
      'Order to Cash': [
        'Forecast monthly revenue from orders',
        'Detect late or risky payments on open orders',
      ],
      'Billing & Payments': [
        'Predict payment failure risk before capture',
        'Prioritize collections for overdue invoices',
      ],
      'Product Catalog': ['Recommend products for active users'],
      'Support': ['Predict ticket escalation risk', 'Forecast resolution time for new tickets'],
      'Sales Pipeline': ['Score opportunities for likelihood to close'],
      'Inventory Management': ['Forecast weekly inventory demand'],
    };

    const processes = results?.automl_guidance?.business_processes || [];
    const ideas = new Set<string>();

    processes.forEach((item) => {
      (templates[item.process] || []).forEach((idea) => ideas.add(idea));
    });

    recommendedTargets.slice(0, 3).forEach((rec) => {
      const prefix = rec.task === 'regression' ? 'Forecast' : 'Predict';
      ideas.add(`${prefix} ${rec.column} for ${rec.table}`);
    });

    if (ideas.size === 0) {
      ['Predict churn for active subscribers', 'Forecast weekly revenue', 'Detect anomalous transactions'].forEach(
        (idea) => ideas.add(idea)
      );
    }

    return Array.from(ideas).slice(0, 6);
  }, [recommendedTargets, results?.automl_guidance?.business_processes]);

  const tableOptions = useMemo(() => {
    const nodes = results?.graph?.nodes || [];
    return nodes
      .map((node) => ({
        id: node.id,
        label: node.label,
        columnCount: node.column_count,
        rowCount: node.row_count,
        columns: node.columns,
      }))
      .sort((a, b) => (b.rowCount || 0) - (a.rowCount || 0));
  }, [results?.graph?.nodes]);

  const columnOptions = useMemo(() => {
    const table = tableOptions.find((t) => t.id === targetTable);
    return table?.columns || [];
  }, [tableOptions, targetTable]);

  useEffect(() => {
    if (prefillTarget?.table) {
      setTargetTable(prefillTarget.table);
    }
    if (prefillTarget?.column !== undefined) {
      setTargetColumn(prefillTarget.column || '');
    }
    if (prefillTarget?.task) {
      setTask(prefillTarget.task);
    }
  }, [prefillTarget?.table, prefillTarget?.column, prefillTarget?.task]);

  useEffect(() => {
    if (!targetTable && recommendedTargets.length) {
      const primary = recommendedTargets[0];
      setTargetTable(primary.table);
      setTargetColumn(primary.column || '');
      if (primary.task) {
        setTask(primary.task);
      }
    }
  }, [recommendedTargets, targetTable]);

  const handleSelectTable = (value: string) => {
    setTargetTable(value);
    setTargetColumn('');
  };

  const applyRecommendation = (rec: AutomlTargetRecommendation) => {
    setTargetTable(rec.table);
    setTargetColumn(rec.column || '');
    if (rec.task) {
      setTask(rec.task);
    }
  };

  const updatePlaybookState = (pb: GeneratedPlaybookSummary) => {
    const next = [
      ...playbooks.filter((existing) => existing.id !== pb.id),
      {
        id: pb.id,
        name: pb.name,
        description: pb.description || pb.name,
        domain: pb.domain,
        required_inputs: pb.required_inputs,
        steps: pb.steps,
        defaults: pb.defaults,
      },
    ];
    dispatch(setPlaybooks(next));
  };

  const handleGenerate = async () => {
    if (!useCase.trim()) {
      setError('Add a short description of the business problem.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiClient.generatePlaybookFromGdm({
        job_id: jobId,
        use_case: useCase,
        task,
        target_table: targetTable || undefined,
        target_column: targetColumn || undefined,
        metric,
        time_limit_minutes: timeLimit,
        max_trials: maxTrials,
      });
      setSuccess(response);
      updatePlaybookState(response);
      onGenerated?.(response);
    } catch (err: any) {
      const message = err?.response?.data?.detail || err.message || 'Unable to generate playbook';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        p: 3,
        borderRadius: 3,
        borderColor:
          theme.palette.mode === 'dark' ? 'rgba(118,185,0,0.45)' : 'rgba(118,185,0,0.28)',
        background:
          theme.palette.mode === 'dark'
            ? 'linear-gradient(145deg, rgba(12,18,15,0.96), rgba(10,14,12,0.9)), radial-gradient(circle at 14% 18%, rgba(118,185,0,0.24), transparent 38%), radial-gradient(circle at 90% 10%, rgba(0,180,216,0.22), transparent 34%)'
            : 'linear-gradient(145deg, #f7fbf7, #eef4ee)',
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 18px 48px rgba(0,0,0,0.55)'
            : '0 12px 32px rgba(11,15,13,0.12)',
        '& .MuiOutlinedInput-root': {
          backgroundColor:
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
        },
      })}
    >
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip color="primary" label="Step 2" size="small" />
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Generate an AutoML playbook from this Global Data Model
            <AutoAwesomeIcon color="primary" fontSize="small" />
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          The assistant will use the entities and relationships discovered in job {jobId} to tailor an AutoML
          playbook for your database. Provide a brief objective and optional target hints.
        </Typography>

        {businessObjectives.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Try a suggested business objective</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {businessObjectives.map((idea) => (
                <Chip
                  key={idea}
                  label={idea}
                  onClick={() => setUseCase(idea)}
                  variant="outlined"
                  color="secondary"
                />
              ))}
            </Stack>
          </Stack>
        )}

        {recommendedTargets.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Suggested targets from your data</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {recommendedTargets.slice(0, 3).map((rec) => (
                <Chip
                  key={`${rec.table}-${rec.column}-${rec.task}`}
                  label={`${rec.table}.${rec.column} · ${rec.task}`}
                  onClick={() => applyRecommendation(rec)}
                  color="secondary"
                  variant="outlined"
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {recommendedTargets[0]?.reason}
            </Typography>
          </Stack>
        )}

        {success && (
          <Alert
            severity="success"
            icon={<LibraryAddCheckIcon fontSize="small" />}
            sx={{ borderRadius: 2 }}
          >
            Playbook "{success.name}" created. Open the Run Playbook dialog to launch AutoML.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              label="Business objective"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              fullWidth
              helperText="Example: Predict churn for subscribers or forecast weekly revenue."
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              label="Problem type"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              fullWidth
              helperText="Select the type of ML problem to solve"
            >
              {[
                { value: 'classification', label: 'Classification - Predict categories' },
                { value: 'regression', label: 'Regression - Predict numbers' },
                { value: 'forecasting', label: 'Forecasting - Predict time series' },
                { value: 'clustering', label: 'Clustering - Group similar records' },
                { value: 'anomaly', label: 'Anomaly - Detect outliers' },
              ].map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              label="Target table (optional)"
              value={targetTable}
              onChange={(e) => handleSelectTable(e.target.value)}
              fullWidth
            >
              <MenuItem value="">
                <em>Let AI choose</em>
              </MenuItem>
              {tableOptions.map((table) => (
                <MenuItem key={table.id} value={table.id}>
                  {table.label} {table.rowCount ? `· ${table.rowCount.toLocaleString()} rows` : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              label="Target column (optional)"
              value={targetColumn}
              onChange={(e) => setTargetColumn(e.target.value)}
              fullWidth
              disabled={!targetTable}
            >
              <MenuItem value="">
                <em>Let AI choose</em>
              </MenuItem>
              {columnOptions.map((col) => (
                <MenuItem key={col.name} value={col.name}>
                  {col.name} {col.is_primary_key ? '· primary key' : ''}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              select
              label="Primary metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              fullWidth
              helperText={task === 'clustering' || task === 'anomaly' ? 'Auto-selected based on task' : undefined}
            >
              {task === 'classification' && [
                { value: 'accuracy', label: 'Accuracy' },
                { value: 'balanced_accuracy', label: 'Balanced Accuracy' },
                { value: 'f1_weighted', label: 'F1 Score (Weighted)' },
                { value: 'AUC_weighted', label: 'AUC (Weighted)' },
                { value: 'log_loss', label: 'Log Loss' },
              ].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
              {task === 'regression' && [
                { value: 'r2', label: 'R² Score' },
                { value: 'rmse', label: 'RMSE' },
                { value: 'mae', label: 'MAE' },
                { value: 'mape', label: 'MAPE' },
              ].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
              {task === 'forecasting' && [
                { value: 'MASE', label: 'MASE (Mean Absolute Scaled Error)' },
                { value: 'MAPE', label: 'MAPE (Mean Absolute Percentage Error)' },
                { value: 'RMSE', label: 'RMSE (Root Mean Square Error)' },
                { value: 'MAE', label: 'MAE (Mean Absolute Error)' },
              ].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
              {task === 'clustering' && [
                { value: 'silhouette', label: 'Silhouette Score' },
              ].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
              {task === 'anomaly' && [
                { value: 'auc_roc', label: 'AUC-ROC' },
              ].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField
              label="Time budget (minutes)"
              type="number"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              fullWidth
              inputProps={{ min: 5, max: 240 }}
            />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField
              label="Max trials"
              type="number"
              value={maxTrials}
              onChange={(e) => setMaxTrials(Number(e.target.value))}
              fullWidth
              inputProps={{ min: 1, max: 60 }}
            />
          </Grid>
        </Grid>

        <Box display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            color="primary"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating…' : 'Generate playbook'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
};

export default PlaybookFromGDM;
