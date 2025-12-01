/**
 * AssistantTabs - Tab Navigation Component for Database Assistant
 *
 * Provides tab navigation between:
 * - Chat Workspace
 * - AutoML Studio
 * - AI Forecasts & Insights
 */

import React from 'react';
import { Box, Tabs, Tab, Badge, Chip, useTheme, alpha } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import InsightsIcon from '@mui/icons-material/Insights';
import { AssistantTab, useAssistant } from '../../contexts/AssistantContext';

interface TabPanelProps {
  children?: React.ReactNode;
  value: AssistantTab;
  activeTab: AssistantTab;
}

export const TabPanel: React.FC<TabPanelProps> = ({ children, value, activeTab }) => {
  return (
    <Box
      role="tabpanel"
      hidden={value !== activeTab}
      id={`assistant-tabpanel-${value}`}
      aria-labelledby={`assistant-tab-${value}`}
      sx={{
        flex: 1,
        display: value === activeTab ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {value === activeTab && children}
    </Box>
  );
};

const AssistantTabs: React.FC = () => {
  const theme = useTheme();
  const { activeTab, setActiveTab, automlStatus, forecastData, automlJobId } = useAssistant();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: AssistantTab) => {
    setActiveTab(newValue);
  };

  const isTraining = automlStatus === 'training';
  const hasResults = automlStatus === 'completed' && automlJobId;
  const hasForecast = !!forecastData;

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(8px)',
      }}
    >
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        aria-label="Assistant workspace tabs"
        sx={{
          minHeight: 48,
          '& .MuiTab-root': {
            minHeight: 48,
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.9rem',
          },
        }}
      >
        <Tab
          value="chat"
          icon={<ChatIcon fontSize="small" />}
          iconPosition="start"
          label="Chat"
          id="assistant-tab-chat"
          aria-controls="assistant-tabpanel-chat"
        />
        <Tab
          value="automl"
          icon={
            <Badge
              color="warning"
              variant="dot"
              invisible={!isTraining}
              sx={{
                '& .MuiBadge-badge': {
                  animation: isTraining ? 'pulse 1.5s infinite' : 'none',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                    '100%': { opacity: 1 },
                  },
                },
              }}
            >
              <AutoGraphIcon fontSize="small" />
            </Badge>
          }
          iconPosition="start"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              AutoML Studio
              {isTraining && (
                <Chip
                  label="Training"
                  size="small"
                  color="warning"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
              {hasResults && !isTraining && (
                <Chip
                  label="Ready"
                  size="small"
                  color="success"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          }
          id="assistant-tab-automl"
          aria-controls="assistant-tabpanel-automl"
        />
        <Tab
          value="forecasts"
          icon={
            <Badge
              color="success"
              variant="dot"
              invisible={!hasForecast}
            >
              <InsightsIcon fontSize="small" />
            </Badge>
          }
          iconPosition="start"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              AI Forecasts
              {hasForecast && (
                <Chip
                  label="New"
                  size="small"
                  color="info"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          }
          id="assistant-tab-forecasts"
          aria-controls="assistant-tabpanel-forecasts"
          disabled={!hasResults && !hasForecast}
        />
      </Tabs>
    </Box>
  );
};

export default AssistantTabs;
