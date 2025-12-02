/**
 * ChatInterface - Database Assistant Workspace
 *
 * Hosts the chat and analysis experience. AutoML Studio and AI Forecasts now live
 * in the Assistant Suite navigation under Schema Explorer.
 */

import React, { useEffect, useState } from 'react';
import { Box, Container, Paper, Alert, Button, Collapse, Stack } from '@mui/material';
import { AssistantProvider } from '../../contexts/AssistantContext';
import ChatWorkspacePanel from '../Assistant/ChatWorkspacePanel';
import { useNavigate } from 'react-router-dom';
import DataSourceSelector from '../Assistant/DataSourceSelector';
import { SwapHoriz as SwitchIcon } from '@mui/icons-material';
import { useDatabase } from '../../contexts/DatabaseContext';

interface ChatInterfaceProps {
  onOpenConnectionDialog?: () => void;
}

const AssistantContent: React.FC<ChatInterfaceProps> = ({ onOpenConnectionDialog }) => {
  const navigate = useNavigate();
  const { activeSource, isConnected, csvDataset } = useDatabase();
  const [showSourceSelector, setShowSourceSelector] = useState(false);

  const hasActiveSource =
    (activeSource === 'database' && isConnected) || (activeSource === 'csv' && !!csvDataset);

  useEffect(() => {
    if (!hasActiveSource) {
      setShowSourceSelector(true);
    }
  }, [hasActiveSource]);

  return (
    <Paper
      elevation={1}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: { xs: 1, sm: 2 },
        height: 'calc(100vh - 120px)',
        minHeight: 640,
      }}
    >
      <Stack direction="row" justifyContent="flex-end">
        <Button
          size="small"
          variant="text"
          startIcon={<SwitchIcon />}
          onClick={() => setShowSourceSelector((prev) => !prev)}
        >
          {showSourceSelector ? 'Hide source picker' : 'Change data source'}
        </Button>
      </Stack>

      <Collapse in={showSourceSelector || !hasActiveSource}>
        <DataSourceSelector onConnectClick={onOpenConnectionDialog || (() => {})} />
      </Collapse>

      <Alert
        severity="info"
        variant="outlined"
        action={
          <Button color="primary" size="small" onClick={() => navigate('/solutions/automl')}>
            Open AutoML & AI Forecasts
          </Button>
        }
      >
        AutoML Studio and AI Forecasts now live in the Assistant Suite panel under Schema Explorer.
      </Alert>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ChatWorkspacePanel />
      </Box>
    </Paper>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onOpenConnectionDialog }) => {
  return (
    <Container
      maxWidth={false}
      sx={{
        px: { xs: 0, sm: 1 },
        py: 1,
      }}
    >
      <AssistantProvider>
        <AssistantContent onOpenConnectionDialog={onOpenConnectionDialog} />
      </AssistantProvider>
    </Container>
  );
};

export default ChatInterface;
