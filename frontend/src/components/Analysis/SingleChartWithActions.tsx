import React from 'react';
import { Box, Tooltip, Button } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ChartDisplay from './ChartDisplay';
import { useDispatch } from 'react-redux';
import { addChart } from '../../store/dashboardSlice';
import { useChat } from '../../contexts/ChatContext';

interface Props {
  chart: { type: string; data: string; config?: any; title?: string };
  query?: string;
}

const SingleChartWithActions: React.FC<Props> = ({ chart, query }) => {
  const dispatch = useDispatch();
  const { currentSessionId, sessions } = useChat();

  const handleSend = () => {
    const sessionTitle = sessions.find(s => s.id === currentSessionId)?.title;
    dispatch(
      addChart({
        id: `chart_${Date.now()}`,
        title: chart.title || 'Visualization',
        data: chart.data,
        type: chart.type,
        source: 'chat',
        timestamp: new Date().toISOString(),
        metadata: { query, chatSessionId: currentSessionId, chatTitle: sessionTitle },
      })
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Tooltip title="Save to Dashboard">
          <Button size="small" startIcon={<DashboardIcon />} onClick={handleSend} variant="outlined">
            Save to Dashboard
          </Button>
        </Tooltip>
      </Box>
      <ChartDisplay chartData={chart} />
    </Box>
  );
};

export default SingleChartWithActions;
