import React from 'react';
import { Box, Alert } from '@mui/material';

interface TabPanelProps {
  children?: React.ReactNode;
  hidden?: boolean;
}

export const TabPanel: React.FC<TabPanelProps> = ({ children, hidden }) => {
  return (
    <Box
      role="tabpanel"
      hidden={hidden}
      sx={{
        flex: 1,
        display: hidden ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {!hidden && children}
    </Box>
  );
};

const AssistantTabs: React.FC = () => (
  <Alert severity="info" sx={{ borderRadius: 0 }}>
    AutoML Studio and AI Forecasts have moved to the Assistant Suite navigation.
  </Alert>
);

export default AssistantTabs;
