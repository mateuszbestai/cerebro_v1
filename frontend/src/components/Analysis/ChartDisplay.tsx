import React, { useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, Tooltip, Dialog, DialogContent } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import Plot from 'react-plotly.js';
import Plotly from 'plotly.js';

interface ChartDisplayProps {
  chartData: {
    type: string;
    data: string; // JSON string from backend
    config?: any;
  };
}

const ChartDisplay: React.FC<ChartDisplayProps> = ({ chartData }) => {
  const chartRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const parsedData = useMemo(() => {
    try {
      return JSON.parse(chartData.data);
    } catch (error) {
      console.error('Error parsing chart data:', error);
      return null;
    }
  }, [chartData.data]);

  if (!parsedData) {
    return (
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography color="error">Error loading chart data</Typography>
      </Paper>
    );
  }

  const handleDownload = async () => {
    try {
      const gd = chartRef.current?.el as any;
      if (!gd) return;
      await Plotly.downloadImage(gd, {
        format: 'png',
        filename: `chart_${chartData.type || 'plot'}`,
        width: 1000,
        height: 600,
        scale: 2,
      } as any);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleFullscreen = () => {
    setIsFullscreen(true);
  };

  return (
    <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Data Visualization</Typography>
        <Box>
        <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fullscreen">
            <IconButton size="small" onClick={handleFullscreen}>
              <FullscreenIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download">
            <IconButton size="small" onClick={handleDownload}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ width: '100%', height: 400 }}>
        <Plot
          key={refreshKey}
          ref={chartRef}
          data={parsedData.data || []}
          layout={{
            ...parsedData.layout,
            autosize: true,
            margin: { t: 30, r: 30, b: 50, l: 50 },
          }}
          config={chartData.config || { responsive: true }}
          style={{ width: '100%', height: '100%' }}
        />
      </Box>

      {/* Fullscreen dialog */}
      <Dialog open={isFullscreen} onClose={() => setIsFullscreen(false)} fullWidth maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, pl: 2 }}>
          <Typography variant="subtitle1">Fullscreen Chart</Typography>
          <IconButton size="small" onClick={() => setIsFullscreen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ height: '80vh', p: 0 }}>
          <Box sx={{ width: '100%', height: '100%' }}>
            <Plot
              data={parsedData.data || []}
              layout={{
                ...parsedData.layout,
                autosize: true,
                margin: { t: 50, r: 50, b: 70, l: 70 },
              }}
              config={chartData.config || { responsive: true }}
              style={{ width: '100%', height: '100%' }}
            />
          </Box>
        </DialogContent>
      </Dialog>
    </Paper>
  );
};

export default ChartDisplay;
