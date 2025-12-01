/**
 * Results Step - AutoML Results Display
 *
 * Shows comprehensive results including:
 * - Executive summary (from LLM)
 * - Model leaderboard
 * - Feature importance chart
 * - Confusion matrix (for classification)
 * - Sample predictions
 * - Next actions
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import InsightsIcon from '@mui/icons-material/Insights';

import { automlApi } from '../../../services/automlApi';
import { AutoMLResultsResponse, TaskType } from '../../../types/automl';
import FeatureImportanceChart from '../charts/FeatureImportanceChart';
import ConfusionMatrixChart from '../charts/ConfusionMatrixChart';

interface ResultsStepProps {
  jobId: string;
  task: TaskType;
  targetColumn: string;
  onNewTraining: () => void;
}

const formatScore = (score: number | null | undefined, metric: string | null | undefined): string => {
  if (score === null || score === undefined) {
    return 'N/A';
  }
  // Most metrics are better as percentages
  const metricStr = metric?.toLowerCase() || '';
  if (metricStr.includes('accuracy') || metricStr.includes('auc') || metricStr.includes('f1') || metricStr.includes('r2')) {
    return `${(score * 100).toFixed(1)}%`;
  }
  return score.toFixed(4);
};

const getScoreColor = (score: number | null | undefined, task: TaskType): 'success' | 'warning' | 'error' => {
  if (score === null || score === undefined) {
    return 'warning';
  }
  if (task === 'classification') {
    if (score >= 0.9) return 'success';
    if (score >= 0.7) return 'warning';
    return 'error';
  } else {
    // Regression (R2)
    if (score >= 0.8) return 'success';
    if (score >= 0.5) return 'warning';
    return 'error';
  }
};

const ResultsStep: React.FC<ResultsStepProps> = ({
  jobId,
  task,
  onNewTraining,
}) => {
  const [results, setResults] = useState<AutoMLResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadResults = async () => {
      try {
        const data = await automlApi.getJobResults(jobId);
        setResults(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };
    loadResults();
  }, [jobId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !results) {
    return (
      <Alert severity="error">
        <Typography variant="subtitle2">Failed to Load Results</Typography>
        <Typography variant="body2">{error}</Typography>
        <Button variant="outlined" onClick={onNewTraining} sx={{ mt: 1 }}>
          Start New Training
        </Button>
      </Alert>
    );
  }

  const scoreColor = getScoreColor(results.best_score, task);

  return (
    <Box>
      {/* Header with Summary */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <EmojiEventsIcon sx={{ fontSize: 64, color: 'warning.main', mb: 1 }} />
        <Typography variant="h4" gutterBottom>
          Training Complete!
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Your model is ready to make predictions
        </Typography>
      </Box>

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="overline" color="text.secondary">
                Best Model
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {results.best_model}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="overline" color="text.secondary">
                {results.eval_metric || 'Score'}
              </Typography>
              <Typography variant="h4" fontWeight="bold" color={`${scoreColor}.main`}>
                {formatScore(results.best_score, results.eval_metric)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="overline" color="text.secondary">
                Training Time
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {Math.round(results.training_time_seconds / 60)} min
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {results.num_rows_train.toLocaleString()} rows, {results.num_features} features
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* LLM Insights */}
      {results.insights && (
        <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.light' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <InsightsIcon sx={{ mr: 1 }} />
              <Typography variant="h6">AI Analysis</Typography>
            </Box>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {results.insights.executive_summary}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              What the score means:
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {results.insights.accuracy_explanation}
            </Typography>
            {results.insights.key_insights && results.insights.key_insights.length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Key Insights:
                </Typography>
                {results.insights.key_insights.map((insight, idx) => (
                  <Box key={idx} sx={{ mb: 1, pl: 2, borderLeft: 3, borderColor: 'primary.main' }}>
                    <Typography variant="body2" fontWeight="bold">
                      {insight.feature}
                    </Typography>
                    <Typography variant="body2">{insight.insight}</Typography>
                    <Typography variant="body2" color="primary.dark">
                      Action: {insight.business_action}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
            {results.insights.recommendation && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Recommendation</Typography>
                <Typography variant="body2">{results.insights.recommendation}</Typography>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feature Importance */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Feature Importance</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These are the factors that most influence the prediction. Higher values mean more impact.
          </Typography>
          <FeatureImportanceChart
            featureImportance={results.feature_importance}
            maxFeatures={15}
          />
        </AccordionDetails>
      </Accordion>

      {/* Model Leaderboard */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Model Leaderboard</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            All models that were trained, ranked by performance.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Score</TableCell>
                  <TableCell align="right">Fit Time</TableCell>
                  <TableCell align="right">Predict Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.leaderboard.slice(0, 10).map((entry, idx) => (
                  <TableRow
                    key={entry.model}
                    sx={{
                      bgcolor: idx === 0 ? 'success.light' : 'inherit',
                    }}
                  >
                    <TableCell>
                      {idx === 0 ? <EmojiEventsIcon color="warning" fontSize="small" /> : idx + 1}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={idx === 0 ? 'bold' : 'normal'}>
                        {entry.model}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {formatScore(entry.score_val, results.eval_metric)}
                    </TableCell>
                    <TableCell align="right">
                      {entry.fit_time ? `${entry.fit_time.toFixed(1)}s` : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {entry.pred_time_val ? `${entry.pred_time_val.toFixed(3)}s` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>

      {/* Confusion Matrix (Classification only) */}
      {task === 'classification' && results.confusion_matrix && results.class_labels && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Confusion Matrix</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Shows how well the model predicts each category. Diagonal values are correct predictions.
            </Typography>
            <ConfusionMatrixChart
              matrix={results.confusion_matrix}
              labels={results.class_labels}
            />
          </AccordionDetails>
        </Accordion>
      )}

      {/* Sample Predictions */}
      {results.predictions_sample && results.predictions_sample.length > 0 && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Sample Predictions</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Example predictions from your training data.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Actual</TableCell>
                    <TableCell>Predicted</TableCell>
                    <TableCell>Match</TableCell>
                    {task === 'classification' && <TableCell>Confidence</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.predictions_sample.map((pred, idx) => {
                    const isMatch = String(pred.actual) === String(pred.predicted);
                    return (
                      <TableRow key={idx}>
                        <TableCell>{String(pred.actual)}</TableCell>
                        <TableCell>{String(pred.predicted)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={isMatch ? 'Correct' : 'Wrong'}
                            color={isMatch ? 'success' : 'error'}
                          />
                        </TableCell>
                        {task === 'classification' && pred.probabilities && (
                          <TableCell>
                            {Math.max(...Object.values(pred.probabilities)) * 100}%
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Next Actions */}
      <Typography variant="h6" gutterBottom>
        Next Steps
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<DownloadIcon />}
            onClick={() => {
              // Download model (placeholder)
              alert('Model download feature coming soon!');
            }}
          >
            Download Model
          </Button>
        </Grid>
        <Grid item xs={12} md={4}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<InsightsIcon />}
            onClick={() => {
              // Navigate to predictions (placeholder)
              alert('Prediction interface coming soon!');
            }}
          >
            Make Predictions
          </Button>
        </Grid>
        <Grid item xs={12} md={4}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<RefreshIcon />}
            onClick={onNewTraining}
          >
            Train New Model
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ResultsStep;
