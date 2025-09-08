import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Container,
  Typography,
  Divider,
  CircularProgress,
} from '@mui/material';
import { useChat } from '../../hooks/useChat';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ChartDisplay from '../Analysis/ChartDisplay';
import DataTable from '../Analysis/DataTable';

const ChatInterface: React.FC = () => {
  const { messages, isLoading, sendMessage, currentAnalysis } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 100px)' }}>
        {/* Chat Section */}
        <Paper
          elevation={3}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
            <Typography variant="h6">AI Analysis Assistant</Typography>
            <Typography variant="caption" color="text.secondary">
              Ask questions about your data
            </Typography>
          </Box>

          <MessageList messages={messages} />

          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          <div ref={messagesEndRef} />

          <Divider />

          <MessageInput onSendMessage={sendMessage} disabled={isLoading} />
        </Paper>

        {/* Results Section */}
        {currentAnalysis && (
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
              <Typography variant="h6">Analysis Results</Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {currentAnalysis.visualization && (
                <ChartDisplay chartData={currentAnalysis.visualization} />
              )}

              {currentAnalysis.data && (
                <Box sx={{ mt: 2 }}>
                  <DataTable data={currentAnalysis.data} />
                </Box>
              )}

              {currentAnalysis.report && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    Generated Report
                  </Typography>
                  <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                    {currentAnalysis.report}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        )}
      </Box>
    </Container>
  );
};

export default ChatInterface;