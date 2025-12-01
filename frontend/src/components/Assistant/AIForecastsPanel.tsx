/**
 * AIForecastsPanel - AI Insights & Forecasts Dashboard
 *
 * Displays comprehensive results from AutoML training plus GPT-5 generated
 * business intelligence including:
 * - Executive summary
 * - Model performance metrics
 * - Feature importance
 * - Key business drivers
 * - What-if scenarios
 * - Strategic recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Skeleton,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InsightsIcon from '@mui/icons-material/Insights';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';

import { useAssistant } from '../../contexts/AssistantContext';
import { automlApi } from '../../services/automlApi';
import { forecastApi } from '../../services/forecastApi';
import { AutoMLResultsResponse } from '../../types/automl';
import { ForecastResult, KeyDriver, WhatIfScenario } from '../../types/forecast';
import FeatureImportanceChart from '../AutoML/charts/FeatureImportanceChart';
import ConfusionMatrixChart from '../AutoML/charts/ConfusionMatrixChart';

const AIForecastsPanel: React.FC = () => {
  const theme = useTheme();
  const { automlJobId, automlStatus, forecastData, setForecastData, setIsLoadingForecast } = useAssistant();

  // State
  const [automlResults, setAutomlResults] = useState<AutoMLResultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');

  // Load AutoML results
  useEffect(() => {
    const loadResults = async () => {
      if (!automlJobId || automlStatus !== 'completed') return;

      setLoading(true);
      setError(null);

      try {
        const results = await automlApi.getJobResults(automlJobId);
        setAutomlResults(results);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load AutoML results');
      } finally {
        setLoading(false);
      }
    };
    loadResults();
  }, [automlJobId, automlStatus]);

  const handleGenerateInsights = useCallback(async () => {
    if (!automlJobId) return;

    setForecastLoading(true);
    setIsLoadingForecast(true);
    setError(null);

    try {
      const result = await forecastApi.generate({
        automl_job_id: automlJobId,
        forecast_type: 'insights',
        context: additionalContext || undefined,
      });

      setForecastData(result as ForecastResult);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate insights');
    } finally {
      setForecastLoading(false);
      setIsLoadingForecast(false);
    }
  }, [automlJobId, additionalContext, setForecastData, setIsLoadingForecast]);

  // Show empty state if no job
  if (!automlJobId) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <InsightsIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          No AutoML Results Yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Train a model in the AutoML Studio tab to see AI-powered insights and forecasts.
        </Typography>
      </Box>
    );
  }

  // Show waiting state
  if (automlStatus !== 'completed') {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Waiting for Model Training
        </Typography>
        <Typography variant="body2" color="text.secondary">
          AI insights will be available after training completes.
        </Typography>
      </Box>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={100} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error && !automlResults) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  const insights = forecastData?.business_insights;

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <InsightsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5">AI Forecasts & Insights</Typography>
            <Typography variant="body2" color="text.secondary">
              GPT-5 powered analysis of your model results
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={forecastLoading ? <CircularProgress size={20} color="inherit" /> : <PsychologyIcon />}
          onClick={handleGenerateInsights}
          disabled={forecastLoading}
        >
          {insights ? 'Regenerate Insights' : 'Generate AI Insights'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Model Performance Summary */}
      {automlResults && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmojiEventsIcon color="warning" fontSize="small" />
            Model Performance
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Best Model</Typography>
              <Typography variant="h6">{automlResults.best_model}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">{automlResults.eval_metric}</Typography>
              <Typography variant="h6" color="success.main">
                {(automlResults.best_score * 100).toFixed(1)}%
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Features Used</Typography>
              <Typography variant="h6">{automlResults.num_features}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Training Rows</Typography>
              <Typography variant="h6">{automlResults.num_rows_train.toLocaleString()}</Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* AI-Generated Insights */}
      {insights ? (
        <Grid container spacing={3}>
          {/* Executive Summary */}
          <Grid item xs={12}>
            <Card
              variant="outlined"
              sx={{
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
                borderColor: alpha(theme.palette.primary.main, 0.3),
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <LightbulbIcon color="primary" />
                  <Typography variant="h6">Executive Summary</Typography>
                  <Chip
                    label={`Confidence: ${(insights.confidence_score * 100).toFixed(0)}%`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>
                <Typography variant="body1">{insights.executive_summary}</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Key Drivers */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUpIcon color="primary" fontSize="small" />
                  Key Business Drivers
                </Typography>
                <List dense>
                  {insights.key_drivers.map((driver: KeyDriver, idx: number) => (
                    <ListItem key={idx} sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', mb: 0.5 }}>
                        <Chip
                          label={driver.factor}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                        <LinearProgress
                          variant="determinate"
                          value={driver.impact_score * 100}
                          sx={{ flex: 1, height: 6, borderRadius: 3 }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {(driver.impact_score * 100).toFixed(0)}%
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {driver.impact}
                      </Typography>
                      <Typography variant="body2" color="primary.main" fontWeight={500}>
                        Action: {driver.recommendation}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* What-If Scenarios */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PsychologyIcon color="secondary" fontSize="small" />
                  What-If Scenarios
                </Typography>
                <List dense>
                  {insights.what_if_scenarios.map((scenario: WhatIfScenario, idx: number) => (
                    <ListItem key={idx} sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {scenario.impact_direction === 'positive' ? (
                          <ArrowUpwardIcon color="success" fontSize="small" />
                        ) : scenario.impact_direction === 'negative' ? (
                          <ArrowDownwardIcon color="error" fontSize="small" />
                        ) : (
                          <HorizontalRuleIcon color="action" fontSize="small" />
                        )}
                        <Typography variant="subtitle2">{scenario.scenario}</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Outcome: {scenario.outcome}
                      </Typography>
                      <Chip
                        label={`${(scenario.confidence * 100).toFixed(0)}% confidence`}
                        size="small"
                        variant="outlined"
                        sx={{ mt: 0.5 }}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Strategic Recommendations */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon color="success" fontSize="small" />
                  Strategic Recommendations
                </Typography>
                <List dense>
                  {insights.strategic_recommendations.map((rec: string, idx: number) => (
                    <ListItem key={idx}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography variant="body2" color="primary" fontWeight={600}>
                          {idx + 1}.
                        </Typography>
                      </ListItemIcon>
                      <ListItemText primary={rec} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Risks & Caveats */}
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningIcon color="warning" fontSize="small" />
                  Risks & Considerations
                </Typography>
                <List dense>
                  {insights.risks_and_caveats.map((caveat: string, idx: number) => (
                    <ListItem key={idx}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <WarningIcon color="action" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={caveat}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Full Narrative */}
          {forecastData?.narrative && (
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">Full Analysis Narrative</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography
                    variant="body2"
                    component="pre"
                    sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
                  >
                    {forecastData.narrative}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            </Grid>
          )}

          {/* Context Input for Regeneration */}
          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Refine with Additional Context
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="E.g., 'Focus on customer retention strategies' or 'Consider Q4 seasonality'"
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                />
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleGenerateInsights}
                  disabled={forecastLoading || !additionalContext}
                >
                  Refine
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      ) : (
        // Prompt to generate insights
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            bgcolor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.05 : 0.02),
          }}
        >
          <PsychologyIcon sx={{ fontSize: 64, color: 'info.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Ready for AI Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Click "Generate AI Insights" to get executive summaries, key drivers,
            what-if scenarios, and strategic recommendations powered by GPT-5.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={forecastLoading ? <CircularProgress size={20} color="inherit" /> : <PsychologyIcon />}
            onClick={handleGenerateInsights}
            disabled={forecastLoading}
          >
            Generate AI Insights
          </Button>
        </Paper>
      )}

      {/* Feature Importance (from AutoML) */}
      {automlResults && (
        <Box sx={{ mt: 3 }}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Feature Importance</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FeatureImportanceChart
                featureImportance={automlResults.feature_importance}
                maxFeatures={15}
              />
            </AccordionDetails>
          </Accordion>

          {/* Confusion Matrix (Classification only) */}
          {automlResults.task === 'classification' &&
            automlResults.confusion_matrix &&
            automlResults.class_labels && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">Confusion Matrix</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <ConfusionMatrixChart
                    matrix={automlResults.confusion_matrix}
                    labels={automlResults.class_labels}
                  />
                </AccordionDetails>
              </Accordion>
            )}

          {/* Model Leaderboard */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Model Leaderboard</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Rank</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell align="right">Score</TableCell>
                      <TableCell align="right">Fit Time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {automlResults.leaderboard.slice(0, 10).map((entry, idx) => (
                      <TableRow
                        key={entry.model}
                        sx={{ bgcolor: idx === 0 ? alpha(theme.palette.success.main, 0.1) : 'inherit' }}
                      >
                        <TableCell>
                          {idx === 0 ? <EmojiEventsIcon color="warning" fontSize="small" /> : idx + 1}
                        </TableCell>
                        <TableCell>{entry.model}</TableCell>
                        <TableCell align="right">
                          {(entry.score_val * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell align="right">
                          {entry.fit_time ? `${entry.fit_time.toFixed(1)}s` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );
};

export default AIForecastsPanel;
