import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import RefreshIcon from '@mui/icons-material/Refresh';
import Plot from 'react-plotly.js';

interface ChartDisplayProps {
  chartData: {
    type: string;
    data: string; // JSON string from backend
    config?: any;
  };
}

const ChartDisplay: React.FC<ChartDisplayProps> = ({ chartData }) => {
  const chartRef = useRef<any>(null);
  
  // Parse the JSON data from backend
  const parsedData = JSON.parse(chartData.data);

  const handleDownload = () => {
    // Download chart as image
    if (chartRef.current) {
      // Plotly download functionality
    }
  };

  const handleFullscreen = () => {
    // Open chart in fullscreen modal
  };

  return (
    <Paper elevation={2} sx={{ p: 2, position: 'relative' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Data Visualization</Typography>
        <Box>
          <Tooltip title="Refresh">
            <IconButton size="small">
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
          ref={chartRef}
          data={parsedData.data}
          layout={{
            ...parsedData.layout,
            autosize: true,
            margin: { t: 30, r: 30, b: 50, l: 50 },
          }}
          config={chartData.config || { responsive: true }}
          style={{ width: '100%', height: '100%' }}
        />
      </Box>
    </Paper>
  );
};

export default ChartDisplay;