/**
 * ChatWorkspacePanel - Chat Tab Content
 *
 * Extracted from ChatInterface to work within the tabbed assistant interface.
 * Contains the chat messages, input, and analysis results panel.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Collapse,
  IconButton,
  Tooltip,
  Badge,
  Dialog,
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  TableChart as TableIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  History as HistoryIcon,
  Stop as StopIcon,
  ClearAll as ClearAllIcon,
} from '@mui/icons-material';
import { useChat } from '../../contexts/ChatContext';
import { useDatabase } from '../../contexts/DatabaseContext';
import MessageList from '../Chat/MessageList';
import MessageInput from '../Chat/MessageInput';
import ChartDisplay from '../Analysis/ChartDisplay';
import MultipleChartsDisplay from '../Analysis/MultipleChartsDisplay';
import DataTable from '../Analysis/DataTable';
import ChatSessionsControls from '../Chat/ChatSessionsControls';
import SingleChartWithActions from '../Analysis/SingleChartWithActions';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import ModelSelector from '../Chat/ModelSelector';
import { alpha, useTheme } from '@mui/material/styles';
import PlaybookRunner from '../Playbooks/PlaybookRunner';

const ChatWorkspacePanel: React.FC = () => {
  const { messages, isLoading, sendMessage, currentAnalysis, clearMessages, stopGeneration } = useChat();
  const {
    isConnected,
    databaseInfo,
    selectedTables,
    tables,
    getTableContext
  } = useDatabase();
  const theme = useTheme();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDatabaseContext, setShowDatabaseContext] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useSelector((state: RootState) => state.analysis.history);
  const hasAnalysisPanel = Boolean(showAnalysisPanel && currentAnalysis);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-show analysis panel when there's new analysis
  useEffect(() => {
    if (currentAnalysis && (currentAnalysis.data || currentAnalysis.visualization)) {
      setShowAnalysisPanel(true);
    }
  }, [currentAnalysis]);

  const handleSendMessage = async (message: string) => {
    // The useChat hook will automatically include database context
    await sendMessage(message);
  };

  const formatTableInfo = () => {
    if (!isConnected || !tables) return '';

    if (selectedTables.length > 0) {
      return `Analyzing ${selectedTables.length} table${selectedTables.length > 1 ? 's' : ''}: ${selectedTables.join(', ')}`;
    }
    return `${tables.length} tables available`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Database Context Bar */}
      {isConnected && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={2}>
              <Chip
                icon={<DatabaseIcon />}
                label={databaseInfo?.database_name || 'Connected'}
                color="success"
                variant="outlined"
              />

              <Chip
                icon={<TableIcon />}
                label={formatTableInfo()}
                variant="outlined"
                color={selectedTables.length > 0 ? 'primary' : 'default'}
              />

              {selectedTables.length === 0 && tables.length > 0 && (
                <Alert severity="info" sx={{ py: 0, px: 1 }}>
                  <Typography variant="caption">
                    Tip: Select tables in Schema Explorer for focused analysis
                  </Typography>
                </Alert>
              )}
            </Box>

            <Box display="flex" alignItems="center" gap={1}>
              <Button
                size="small"
                startIcon={showDatabaseContext ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setShowDatabaseContext(!showDatabaseContext)}
              >
                Context
              </Button>
            </Box>
          </Box>

          {/* Expandable Database Context */}
          <Collapse in={showDatabaseContext}>
            <Box
              sx={{
                mt: 2,
                p: 2,
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.04),
                borderRadius: 1,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Database Context for AI:
              </Typography>
              <Typography
                variant="body2"
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {getTableContext()}
              </Typography>
            </Box>
          </Collapse>
        </Paper>
      )}

      {/* No Database Warning */}
      {!isConnected && (
        <Alert
          severity="warning"
          sx={{ mb: 2, flexShrink: 0 }}
          icon={<WarningIcon />}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => window.location.href = '/database'}
            >
              Connect Database
            </Button>
          }
        >
          No database connected. SQL queries and data analysis features are limited. Connect a database for full functionality.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: hasAnalysisPanel
            ? { xs: '1fr', lg: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' }
            : '1fr',
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Chat Section */}
        <Paper
          elevation={3}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            minHeight: { xs: 420, lg: 'auto' },
          }}
        >
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="h6">AI Analysis Assistant</Typography>
                <Typography variant="caption" color="text.secondary">
                  {isConnected
                    ? `Connected to ${databaseInfo?.database_name}`
                    : 'Ask questions about your data'
                  }
                </Typography>
              </Box>

              <Box display="flex" alignItems="center" gap={1}>
                <ModelSelector />
                <PlaybookRunner compact />
                {/* Chat sessions controls */}
                <ChatSessionsControls />

                <Tooltip title="Stop response">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<StopIcon />}
                      onClick={stopGeneration}
                      disabled={!isLoading}
                    >
                      Stop
                    </Button>
                  </span>
                </Tooltip>

                <Tooltip title="Clear conversation">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      startIcon={<ClearAllIcon />}
                      onClick={clearMessages}
                      disabled={messages.length === 0}
                    >
                      Clear
                    </Button>
                  </span>
                </Tooltip>

                {currentAnalysis && (
                  <Tooltip title={showAnalysisPanel ? 'Hide Analysis' : 'Show Analysis'}>
                    <IconButton
                      size="small"
                      onClick={() => setShowAnalysisPanel(!showAnalysisPanel)}
                    >
                      <Badge
                        color="primary"
                        variant="dot"
                        invisible={!currentAnalysis.data && !currentAnalysis.visualization}
                      >
                        <TableIcon />
                      </Badge>
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </Box>

          <MessageList messages={messages} />

          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, flexShrink: 0 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          <div ref={messagesEndRef} />

          <Divider />

          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={isLoading}
            showDatabaseHint={isConnected}
            selectedTables={selectedTables}
          />
        </Paper>

        {/* Results Section */}
        {hasAnalysisPanel && (
          <Paper
            elevation={3}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              height: '100%',
              minHeight: { xs: 400, lg: 'auto' },
            }}
          >
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">Analysis Results</Typography>
                <Box display="flex" gap={1}>
                  <Tooltip title="History">
                    <IconButton size="small" onClick={() => setHistoryOpen(true)}>
                      <HistoryIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Refresh">
                    <IconButton size="small">
                      <RefreshIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Close">
                    <IconButton
                      size="small"
                      onClick={() => setShowAnalysisPanel(false)}
                    >
                      <ExpandMoreIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {currentAnalysis.sql_query && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    SQL Query:
                  </Typography>
                  <Typography
                    variant="body2"
                    component="pre"
                    sx={{
                      fontFamily: 'monospace',
                      bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                      p: 1,
                      borderRadius: 1,
                      overflow: 'auto',
                      maxHeight: 100
                    }}
                  >
                    {currentAnalysis.sql_query}
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {/* Multiple Visualizations */}
              {currentAnalysis.visualizations && currentAnalysis.visualizations.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <MultipleChartsDisplay
                    charts={currentAnalysis.visualizations}
                    query={currentAnalysis.query}
                  />
                </Box>
              )}

              {/* Single Visualization (fallback for backward compatibility) */}
              {!currentAnalysis.visualizations && currentAnalysis.visualization && (
                <Box sx={{ mb: 2 }}>
                  <SingleChartWithActions chart={currentAnalysis.visualization} query={currentAnalysis.query} />
                </Box>
              )}

              {/* Data Table */}
              {currentAnalysis.data && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Query Results ({currentAnalysis.row_count || currentAnalysis.data.length} rows)
                  </Typography>
                  <DataTable data={currentAnalysis.data} title={currentAnalysis.query || 'Query Results'} />
                </Box>
              )}

              {/* Report */}
              {currentAnalysis.report && (
                <Box sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50', borderRadius: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    Generated Report
                  </Typography>
                  <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                    {typeof currentAnalysis.report === 'string'
                      ? currentAnalysis.report
                      : JSON.stringify(currentAnalysis.report, null, 2)
                    }
                  </Typography>
                </Box>
              )}

              {/* Error Display */}
              {currentAnalysis.error && (
                <Alert severity="error">
                  <Typography variant="subtitle2">Error:</Typography>
                  <Typography variant="body2">{currentAnalysis.error}</Typography>
                </Alert>
              )}
            </Box>
          </Paper>
        )}
      </Box>

      {/* Quick Tips */}
      {isConnected && messages.length === 0 && (
        <Box sx={{ mt: 3, flexShrink: 0 }}>
          <Typography variant="h6" gutterBottom>
            Quick Start Suggestions:
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip
              label="Show me all tables"
              onClick={() => handleSendMessage("Show me all tables in the database")}
              sx={{ cursor: 'pointer' }}
            />
            <Chip
              label="Analyze data structure"
              onClick={() => handleSendMessage("Analyze the structure of the database")}
              sx={{ cursor: 'pointer' }}
            />
            {selectedTables.length > 0 && (
              <>
                <Chip
                  label={`Analyze ${selectedTables[0]}`}
                  onClick={() => handleSendMessage(`Analyze the ${selectedTables[0]} table and show me key insights`)}
                  sx={{ cursor: 'pointer' }}
                />
                <Chip
                  label={`Sample data from ${selectedTables[0]}`}
                  onClick={() => handleSendMessage(`Show me sample data from ${selectedTables[0]}`)}
                  sx={{ cursor: 'pointer' }}
                />
              </>
            )}
            <Chip
              label="Generate summary report"
              onClick={() => handleSendMessage("Generate a summary report of the database")}
              sx={{ cursor: 'pointer' }}
            />
          </Box>
        </Box>
      )}

      {/* History Dialog */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="lg" fullWidth>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Analysis History
          </Typography>
          {history.length === 0 ? (
            <Typography color="text.secondary">No history yet.</Typography>
          ) : (
            <Box sx={{ maxHeight: '70vh', overflow: 'auto' }}>
              {history.map((item, idx) => (
                <Paper key={idx} sx={{ p: 2, mb: 2 }} variant="outlined">
                  <Typography variant="subtitle1" gutterBottom>
                    {item.query}
                  </Typography>
                  {item.visualizations && item.visualizations.length > 0 && (
                    <MultipleChartsDisplay charts={item.visualizations} query={item.query} />
                  )}
                  {!item.visualizations && item.visualization && (
                    <ChartDisplay chartData={item.visualization} />
                  )}
                  {item.data && (
                    <Box sx={{ mt: 2 }}>
                      <DataTable data={item.data} title={item.query || 'Results'} />
                    </Box>
                  )}
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      </Dialog>
    </Box>
  );
};

export default ChatWorkspacePanel;
