import React, { useState } from 'react';
import {
  Container,
  Grid,
  Paper,
  Typography,
  Box,
  Tabs,
  Tab,
  Card,
  CardContent,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Share as ShareIcon,
  Refresh as RefreshIcon,
  SaveAlt as SaveIcon,
} from '@mui/icons-material';
import ChartDisplay from './ChartDisplay';
import DataTable from './DataTable';
import { useAnalysis } from '../../hooks/useAnalysis';
import LoadingSpinner from '../Common/LoadingSpinner';

const AnalysisResults: React.FC = () => {
  const { currentResult, isAnalyzing, runAnalysis } = useAnalysis();
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleExport = () => {
    // Implement export functionality
    console.log('Exporting results...');
  };

  const handleRefresh = () => {
    if (currentResult?.query) {
      runAnalysis(currentResult.query);
    }
  };

  if (isAnalyzing) {
    return <LoadingSpinner message="Analyzing data..." fullScreen />;
  }

  if (!currentResult) {
    return (
      <Container>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h5" color="text.secondary">
            No analysis results available
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Start by asking a question in the chat interface
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 3 }}>
        <Grid container justifyContent="space-between" alignItems="center">
          <Grid item>
            <Typography variant="h4">Analysis Results</Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {currentResult.query}
            </Typography>
          </Grid>
          <Grid item>
            <Tooltip title="Refresh">
              <IconButton onClick={handleRefresh}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export">
              <IconButton onClick={handleExport}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share">
              <IconButton>
                <ShareIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Save">
              <IconButton>
                <SaveIcon />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab label="Overview" />
          <Tab label="Data" />
          <Tab label="Visualizations" />
          <Tab label="Insights" />
        </Tabs>
      </Box>

      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Analysis Summary
              </Typography>
              <Typography variant="body1">
                {currentResult.response}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Statistics
                </Typography>
                {currentResult.statistics ? (
                  Object.entries(currentResult.statistics).map(([key, value]) => (
                    <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {key}:
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {value as string}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No statistics available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 1 && currentResult.data && (
        <Paper sx={{ p: 3 }}>
          <DataTable data={currentResult.data} />
        </Paper>
      )}

      {activeTab === 2 && currentResult.visualization && (
        <ChartDisplay chartData={currentResult.visualization} />
      )}

      {activeTab === 3 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Key Insights
          </Typography>
          <Typography variant="body1">
            {currentResult.response}
          </Typography>
        </Paper>
      )}
    </Container>
  );
};

export default AnalysisResults;