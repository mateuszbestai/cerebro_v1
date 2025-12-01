/**
 * Configuration Step
 *
 * Allows users to configure training options with simple presets.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Collapse,
  Slider,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SpeedIcon from '@mui/icons-material/Speed';
import BalanceIcon from '@mui/icons-material/Balance';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { automlApi } from '../../../services/automlApi';
import { TaskType, Preset, ColumnInfo, MetricInfo, PresetInfo } from '../../../types/automl';

interface ConfigurationStepProps {
  task: TaskType;
  targetColumn: string;
  columns: ColumnInfo[];
  excludedColumns: string[];
  initialPreset?: Preset;
  initialMetric?: string | null;
  loading: boolean;
  onComplete: (preset: Preset, metric: string | null, timeLimit?: number) => void;
  onBack: () => void;
}

const PRESET_ICONS = {
  quick: <SpeedIcon />,
  balanced: <BalanceIcon />,
  thorough: <PsychologyIcon />,
};

const PRESET_DETAILS = {
  quick: {
    title: 'Quick',
    subtitle: '5 minutes',
    description: 'Fast exploration to validate your approach',
    recommended: false,
  },
  balanced: {
    title: 'Balanced',
    subtitle: '15 minutes',
    description: 'Good balance of speed and accuracy',
    recommended: true,
  },
  thorough: {
    title: 'Thorough',
    subtitle: '60 minutes',
    description: 'Maximum accuracy for production use',
    recommended: false,
  },
};

const ConfigurationStep: React.FC<ConfigurationStepProps> = ({
  task,
  targetColumn,
  columns,
  excludedColumns,
  initialPreset = 'balanced',
  initialMetric,
  loading,
  onComplete,
  onBack,
}) => {
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [metric, setMetric] = useState<string | null>(initialMetric || null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customTimeLimit, setCustomTimeLimit] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [, setPresets] = useState<PresetInfo[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Load available metrics and presets
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [metricsRes, presetsRes] = await Promise.all([
          automlApi.getMetrics(),
          automlApi.getPresets(),
        ]);
        const taskMetrics = task === 'classification' ? metricsRes.classification : metricsRes.regression;
        setMetrics(Array.isArray(taskMetrics) ? taskMetrics : []);
        setPresets(Array.isArray(presetsRes.presets) ? presetsRes.presets : []);
      } catch (err) {
        console.error('Failed to load config:', err);
        setMetrics([]);
        setPresets([]);
      } finally {
        setLoadingConfig(false);
      }
    };
    loadConfig();
  }, [task]);

  const featureCount = columns.length - excludedColumns.length - 1; // Exclude target

  const handleStartTraining = () => {
    onComplete(preset, metric, customTimeLimit || undefined);
  };

  if (loadingConfig) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Configure Training
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose how much time to spend training. Longer training usually means better accuracy.
      </Typography>

      {/* Summary */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="subtitle2">Training Summary</Typography>
        <Typography variant="body2">
          Task: <strong>{task === 'classification' ? 'Classification' : 'Regression'}</strong>
          {' | '}
          Target: <strong>{targetColumn}</strong>
          {' | '}
          Features: <strong>{featureCount}</strong>
        </Typography>
      </Alert>

      {/* Preset Selection */}
      <Typography variant="subtitle1" gutterBottom>
        Training Speed vs Quality
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {(['quick', 'balanced', 'thorough'] as Preset[]).map((presetOption) => {
          const details = PRESET_DETAILS[presetOption];
          const isSelected = preset === presetOption;

          return (
            <Grid item xs={12} md={4} key={presetOption}>
              <Card
                variant="outlined"
                sx={{
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  borderWidth: isSelected ? 2 : 1,
                  position: 'relative',
                }}
              >
                {details.recommended && (
                  <Chip
                    label="Recommended"
                    color="primary"
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: -10,
                      right: 16,
                    }}
                  />
                )}
                <CardActionArea onClick={() => setPreset(presetOption)}>
                  <CardContent sx={{ textAlign: 'center', py: 3 }}>
                    <Box
                      sx={{
                        color: isSelected ? 'primary.main' : 'text.secondary',
                        mb: 1,
                      }}
                    >
                      {PRESET_ICONS[presetOption]}
                    </Box>
                    <Typography variant="h6">{details.title}</Typography>
                    <Typography variant="subtitle2" color="primary.main">
                      {details.subtitle}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {details.description}
                    </Typography>
                    {isSelected && <CheckCircleIcon color="primary" sx={{ mt: 1 }} />}
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Advanced Options */}
      <Box sx={{ mb: 3 }}>
        <Button
          onClick={() => setShowAdvanced(!showAdvanced)}
          endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          size="small"
        >
          Advanced Options
        </Button>
        <Collapse in={showAdvanced}>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Grid container spacing={3}>
              {/* Evaluation Metric */}
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Evaluation Metric</InputLabel>
                  <Select
                    value={metric || ''}
                    label="Evaluation Metric"
                    onChange={(e) => setMetric(e.target.value || null)}
                  >
                    <MenuItem value="">
                      <em>Auto-detect (Recommended)</em>
                    </MenuItem>
                    {metrics.map((m) => (
                      <MenuItem key={m.name} value={m.name}>
                        {m.display_name}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 1 }}
                        >
                          - {m.description}
                        </Typography>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Custom Time Limit */}
              <Grid item xs={12} md={6}>
                <Typography variant="body2" gutterBottom>
                  Custom Time Limit (minutes)
                </Typography>
                <Slider
                  value={customTimeLimit || (preset === 'quick' ? 5 : preset === 'balanced' ? 15 : 60)}
                  onChange={(_, value) => setCustomTimeLimit((value as number) * 60)}
                  min={5}
                  max={120}
                  step={5}
                  marks={[
                    { value: 5, label: '5m' },
                    { value: 15, label: '15m' },
                    { value: 30, label: '30m' },
                    { value: 60, label: '1h' },
                    { value: 120, label: '2h' },
                  ]}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${v} min`}
                />
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outlined" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button
          variant="contained"
          size="large"
          color="primary"
          onClick={handleStartTraining}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {loading ? 'Starting...' : 'Start Training'}
        </Button>
      </Box>
    </Box>
  );
};

export default ConfigurationStep;
