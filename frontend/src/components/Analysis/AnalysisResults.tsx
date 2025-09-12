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
  List,
  ListItemText,
  ListItemButton,
  Divider,
  Chip,
  Button,
} from '@mui/material';
import {
  Download as DownloadIcon,
  History as HistoryIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Clear as ClearIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import ChartDisplay from './ChartDisplay';
import MultipleChartsDisplay from './MultipleChartsDisplay';
import DataTable from './DataTable';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { navigateHistory, selectFromHistory, clearHistory } from '../../store/analysisSlice';
import LoadingSpinner from '../Common/LoadingSpinner';

const AnalysisResults: React.FC = () => {
  const dispatch = useDispatch();
  const { history, currentResult, currentHistoryIndex, isAnalyzing } = useSelector(
    (state: RootState) => state.analysis
  );
  const [activeTab, setActiveTab] = useState(0);
  const [showHistory, setShowHistory] = useState(true);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleExport = () => {
    // Implement export functionality
    console.log('Exporting results...');
  };

  const handleNavigateHistory = (direction: 'prev' | 'next') => {
    dispatch(navigateHistory(direction));
  };

  const handleSelectFromHistory = (index: number) => {
    dispatch(selectFromHistory(index));
    setShowHistory(false);
  };

  const handleClearHistory = () => {
    dispatch(clearHistory());
  };

  if (isAnalyzing) {
    return <LoadingSpinner message="Analyzing data..." fullScreen />;
  }

  if (!currentResult && history.length === 0) {
    return (
      <Container>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HistoryIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h5" color="text.secondary">
            No Analysis History
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Your analysis results from the chat interface will appear here.
            <br />
            You can navigate through previous analyses and compare results.
          </Typography>
          <Button
            variant="contained"
            startIcon={<SendIcon />}
            href="/"
            sx={{ mt: 3 }}
          >
            Start Analysis in Chat
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 150px)' }}>
        {/* History Sidebar */}
        {showHistory && history.length > 0 && (
          <Paper
            elevation={2}
            sx={{
              width: 300,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h6">Analysis History</Typography>
              <Typography variant="caption" color="text.secondary">
                {history.length} analyses
              </Typography>
            </Box>
            <List sx={{ flex: 1, overflow: 'auto' }}>
              {history.map((item, index) => (
                <React.Fragment key={index}>
                  <ListItemButton
                    selected={index === currentHistoryIndex}
                    onClick={() => handleSelectFromHistory(index)}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap>
                          {item.query}
                        </Typography>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(item.timestamp || '').toLocaleString()}
                          </Typography>
                          {item.intent && (
                            <Chip
                              label={item.intent.type}
                              size="small"
                              sx={{ ml: 1, height: 16 }}
                            />
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                  {index < history.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
            <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
              <Button
                fullWidth
                size="small"
                startIcon={<ClearIcon />}
                onClick={handleClearHistory}
                color="error"
              >
                Clear History
              </Button>
            </Box>
          </Paper>
        )}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {currentResult && (
            <>
              <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
                <Grid container justifyContent="space-between" alignItems="center">
                  <Grid item xs>
                    <Typography variant="h5">Analysis Results</Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                      {currentResult.query}
                    </Typography>
                  </Grid>
                  <Grid item>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Previous">
                        <IconButton
                          onClick={() => handleNavigateHistory('prev')}
                          disabled={currentHistoryIndex >= history.length - 1}
                        >
                          <PrevIcon />
                        </IconButton>
                      </Tooltip>
                      <Chip
                        label={`${currentHistoryIndex + 1} / ${history.length}`}
                        sx={{ alignSelf: 'center' }}
                      />
                      <Tooltip title="Next">
                        <IconButton
                          onClick={() => handleNavigateHistory('next')}
                          disabled={currentHistoryIndex <= 0}
                        >
                          <NextIcon />
                        </IconButton>
                      </Tooltip>
                      <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                      <Tooltip title="Toggle History">
                        <IconButton onClick={() => setShowHistory(!showHistory)}>
                          <HistoryIcon color={showHistory ? 'primary' : 'action'} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Export">
                        <IconButton onClick={handleExport}>
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>

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

      {activeTab === 2 && (
        <>
          {currentResult.visualizations && currentResult.visualizations.length > 0 ? (
            <MultipleChartsDisplay
              charts={currentResult.visualizations}
              query={currentResult.query}
            />
          ) : currentResult.visualization ? (
            <ChartDisplay chartData={currentResult.visualization} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No visualizations available
            </Typography>
          )}
        </>
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
            </>
          )}
        </Box>
      </Box>
    </Container>
  );
};

export default AnalysisResults;