/**
 * ChatInterface - Tabbed Database Assistant
 *
 * Main container for the unified Database Assistant experience.
 * Provides three tabs:
 * - Chat Workspace (AI chat + analysis)
 * - AutoML Studio (streamlined ML training)
 * - AI Forecasts & Insights (results dashboard)
 */

import React from 'react';
import { Box, Container, Paper } from '@mui/material';
import { AssistantProvider, useAssistant } from '../../contexts/AssistantContext';
import AssistantTabs, { TabPanel } from '../Assistant/AssistantTabs';
import ChatWorkspacePanel from '../Assistant/ChatWorkspacePanel';
import AutoMLStudioPanel from '../Assistant/AutoMLStudioPanel';
import AIForecastsPanel from '../Assistant/AIForecastsPanel';

const AssistantContent: React.FC = () => {
  const { activeTab } = useAssistant();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 100px)',
        minHeight: 600,
      }}
    >
      {/* Tab Navigation */}
      <Paper
        elevation={1}
        sx={{
          borderRadius: '16px 16px 0 0',
          overflow: 'hidden',
        }}
      >
        <AssistantTabs />
      </Paper>

      {/* Tab Content */}
      <Paper
        elevation={1}
        sx={{
          flex: 1,
          borderRadius: '0 0 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          mt: '-1px', // Overlap with tabs border
        }}
      >
        <TabPanel value="chat" activeTab={activeTab}>
          <ChatWorkspacePanel />
        </TabPanel>

        <TabPanel value="automl" activeTab={activeTab}>
          <AutoMLStudioPanel />
        </TabPanel>

        <TabPanel value="forecasts" activeTab={activeTab}>
          <AIForecastsPanel />
        </TabPanel>
      </Paper>
    </Box>
  );
};

const ChatInterface: React.FC = () => {
  return (
    <Container
      maxWidth={false}
      sx={{
        px: { xs: 0, sm: 1 },
        py: 1,
      }}
    >
      <AssistantProvider>
        <AssistantContent />
      </AssistantProvider>
    </Container>
  );
};

export default ChatInterface;
