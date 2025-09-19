import React, { useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Button,
  Tooltip,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import {
  Send as SendIcon,
  Dashboard as DashboardIcon,
  Fullscreen as FullscreenIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { addMultipleCharts, DashboardChart } from '../../store/dashboardSlice';
import ChartDisplay from './ChartDisplay';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';

interface MultipleChartsDisplayProps {
  charts: Array<{
    type: string;
    title?: string;
    data: string;
    config?: any;
  }>;
  query?: string;
}

const MultipleChartsDisplay: React.FC<MultipleChartsDisplayProps> = ({ charts, query }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentSessionId, sessions } = useChat();
  const [selectedTab, setSelectedTab] = useState(0);
  const [fullscreenChart, setFullscreenChart] = useState<any>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const handleSendToDashboard = () => {
    const sessionTitle = sessions.find(s => s.id === currentSessionId)?.title;
    const dashboardCharts: DashboardChart[] = charts.map((chart, index) => ({
      id: `chart_${Date.now()}_${index}`,
      title: chart.title || `Chart ${index + 1}`,
      data: chart.data,
      type: chart.type,
      config: chart.config,
      source: 'chat',
      timestamp: new Date().toISOString(),
      metadata: {
        query: query,
        chatSessionId: currentSessionId,
        chatTitle: sessionTitle,
      },
    }));

    dispatch(addMultipleCharts(dashboardCharts));
    setSendDialogOpen(false);
    
    // Optional: Navigate to dashboard
    setTimeout(() => {
      navigate('/visualizations');
    }, 500);
  };

  const handleDownloadChart = (chart: any, index: number) => {
    const blob = new Blob([JSON.stringify(chart, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chart.title || `chart_${index + 1}`}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!charts || charts.length === 0) {
    return null;
  }

  // Single chart display
  if (charts.length === 1) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">{charts[0].title || 'Visualization'}</Typography>
          <Box>
            <Tooltip title="Send to Dashboard">
              <IconButton
                size="small"
                onClick={() => setSendDialogOpen(true)}
                color="primary"
              >
                <SendIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton
                size="small"
                onClick={() => setFullscreenChart(charts[0])}
              >
                <FullscreenIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download">
              <IconButton
                size="small"
                onClick={() => handleDownloadChart(charts[0], 0)}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <ChartDisplay
          key={`single_${charts[0].title || charts[0].type}`}
          chartData={{
            type: charts[0].type,
            data: charts[0].data,
            config: charts[0].config,
            title: charts[0].title,
          }}
        />
      </Paper>
    );
  }

  // Multiple charts display
  return (
    <Paper elevation={2} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h6">Multiple Visualizations</Typography>
          <Chip
            label={`${charts.length} charts`}
            size="small"
            color="primary"
            sx={{ mt: 1 }}
          />
        </Box>
        <Button
          variant="contained"
          startIcon={<DashboardIcon />}
          onClick={() => setSendDialogOpen(true)}
          size="small"
        >
          Send All to Dashboard
        </Button>
      </Box>

      <Tabs
        value={selectedTab}
        onChange={(_, newValue) => setSelectedTab(newValue)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        {charts.map((chart, index) => (
          <Tab key={index} label={chart.title || `Chart ${index + 1}`} />
        ))}
      </Tabs>

      <Box sx={{ mt: 2 }}>
        {charts.map((chart, index) => (
          <Box
            key={index}
            hidden={selectedTab !== index}
            sx={{ position: 'relative' }}
          >
            {selectedTab === index && (
              <>
                <Box sx={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
                  <Tooltip title="Fullscreen">
                    <IconButton
                      size="small"
                      onClick={() => setFullscreenChart(chart)}
                    >
                      <FullscreenIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Download">
                    <IconButton
                      size="small"
                      onClick={() => handleDownloadChart(chart, index)}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <ChartDisplay
                  key={`chart_${index}`}
                  chartData={{
                    type: chart.type,
                    data: chart.data,
                    config: chart.config,
                    title: chart.title,
                  }}
                />
              </>
            )}
          </Box>
        ))}
      </Box>

      {/* Alternative Grid View */}
      {false && ( // Set to true to enable grid view
        <Grid container spacing={2}>
          {charts.map((chart, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Paper elevation={1} sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {chart.title || `Chart ${index + 1}`}
                </Typography>
                <ChartDisplay
                  chartData={{
                    type: chart.type,
                    data: chart.data,
                    config: chart.config,
                  }}
                />
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Send to Dashboard Dialog */}
      <Dialog open={sendDialogOpen} onClose={() => setSendDialogOpen(false)}>
        <DialogTitle>Send Charts to Dashboard</DialogTitle>
        <DialogContent>
          <Typography>
            This will send {charts.length} chart{charts.length > 1 ? 's' : ''} to your
            Visualizations Dashboard where you can:
          </Typography>
          <Box component="ul" sx={{ mt: 1 }}>
            <li>Arrange them in different layouts</li>
            <li>Edit titles and descriptions</li>
            <li>Export individual charts or the entire dashboard</li>
            <li>Create custom dashboards</li>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSendToDashboard}
            variant="contained"
            startIcon={<SendIcon />}
          >
            Send to Dashboard
          </Button>
        </DialogActions>
      </Dialog>

      {/* Fullscreen Dialog */}
      <Dialog
        open={!!fullscreenChart}
        onClose={() => setFullscreenChart(null)}
        fullScreen
      >
        {fullscreenChart && (
          <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Box
              sx={{
                p: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="h6">
                {fullscreenChart.title || 'Chart'}
              </Typography>
              <IconButton onClick={() => setFullscreenChart(null)}>
                <CloseIcon />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, p: 2 }}>
              <ChartDisplay
                chartData={{
                  type: fullscreenChart.type,
                  data: fullscreenChart.data,
                  config: fullscreenChart.config,
                }}
              />
            </Box>
          </Box>
        )}
      </Dialog>
    </Paper>
  );
};

export default MultipleChartsDisplay;
