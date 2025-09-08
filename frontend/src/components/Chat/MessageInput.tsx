import React, { useState, KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  IconButton,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import QueryStatsIcon from '@mui/icons-material/QueryStats';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, disabled }) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <TextField
        fullWidth
        multiline
        maxRows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Ask a question about your data..."
        disabled={disabled}
        variant="outlined"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="Query Templates">
                <IconButton
                  size="small"
                  onClick={() => {
                    // Show query templates dropdown
                    console.log('Show templates');
                  }}
                >
                  <QueryStatsIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Attach File">
                <IconButton size="small">
                  <AttachFileIcon />
                </IconButton>
              </Tooltip>
              <IconButton
                onClick={handleSend}
                disabled={!message.trim() || disabled}
                color="primary"
              >
                <SendIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
};

export default MessageInput;