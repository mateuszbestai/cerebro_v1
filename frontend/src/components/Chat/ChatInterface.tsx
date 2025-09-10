import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Container,
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
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  TableChart as TableIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useChat } from '../../contexts/ChatContext';
import { useDatabase } from '../../contexts/DatabaseContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChartDisplay from '../Analysis/ChartDisplay';
import DataTable from '../Analysis/DataTable';

const ChatInterface: React.FC = () => {
  const { messages, isLoading, sendMessage, currentAnalysis } = useChat();
  const { 
    isConnected, 
    databaseInfo, 
    selectedTables, 
    tables,
    getTableContext 
  } = useDatabase();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDatabaseContext, setShowDatabaseContext] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(true);

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
    <Container maxWidth="xl">
      {/* Database Context Bar */}
      {isConnected && (
        <Paper 
          elevation={1} 
          sx={{ 
            p: 2, 
            mb: 2, 
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
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
                    Tip: Select tables in the Database tab for focused analysis
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
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
          sx={{ mb: 2 }}
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

      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 200px)' }}>
        {/* Chat Section */}
        <Paper
          elevation={3}
          sx={{
            flex: showAnalysisPanel && currentAnalysis ? 1 : 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'flex 0.3s ease',
          }}
        >
          <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
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

          <MessageList messages={messages} />

          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
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
        {showAnalysisPanel && currentAnalysis && (
          <Paper
            elevation={3}
            sx={{
              width: '50%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">Analysis Results</Typography>
                <Box display="flex" gap={1}>
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
                      bgcolor: 'grey.100',
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
              {/* Visualization */}
              {currentAnalysis.visualization && (
                <Box sx={{ mb: 2 }}>
                  <ChartDisplay chartData={currentAnalysis.visualization} />
                </Box>
              )}

              {/* Data Table */}
              {currentAnalysis.data && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Query Results ({currentAnalysis.row_count || currentAnalysis.data.length} rows)
                  </Typography>
                  <DataTable data={currentAnalysis.data} />
                </Box>
              )}

              {/* Report */}
              {currentAnalysis.report && (
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
        <Box sx={{ mt: 3 }}>
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
    </Container>
  );
};

export default ChatInterface;