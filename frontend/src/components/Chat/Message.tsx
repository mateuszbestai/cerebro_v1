import React from 'react';
import {
  ListItem,
  Paper,
  Typography,
  Avatar,
  Box,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Person as PersonIcon,
  SmartToy as BotIcon,
  ContentCopy as CopyIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import { Message as MessageType } from '../../types';

interface MessageProps {
  message: MessageType;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  return (
    <ListItem
      sx={{
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        p: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          maxWidth: '70%',
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}
      >
        <Avatar
          sx={{
            bgcolor: isUser ? 'primary.main' : 'secondary.main',
            width: 32,
            height: 32,
          }}
        >
          {isUser ? <PersonIcon /> : <BotIcon />}
        </Avatar>
        
        <Paper
          elevation={1}
          sx={{
            p: 2,
            backgroundColor: isUser ? 'primary.light' : 'white',
            color: isUser ? 'white' : 'text.primary',
            borderRadius: 2,
            position: 'relative',
            '&:hover .message-actions': {
              opacity: 1,
            },
          }}
        >
          {message.error && (
            <Chip
              label="Error"
              color="error"
              size="small"
              sx={{ mb: 1 }}
            />
          )}
          
          <Box className="message-content">
            {isUser ? (
              <Typography variant="body1">{message.content}</Typography>
            ) : (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            )}
          </Box>
          
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              opacity: 0.7,
            }}
          >
            {new Date(message.timestamp).toLocaleTimeString()}
          </Typography>
          
          {!isUser && (
            <Box
              className="message-actions"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                display: 'flex',
                gap: 0.5,
                opacity: 0,
                transition: 'opacity 0.2s',
              }}
            >
              <Tooltip title="Copy">
                <IconButton size="small" onClick={handleCopy}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Good response">
                <IconButton size="small">
                  <ThumbUpIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Bad response">
                <IconButton size="small">
                  <ThumbDownIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Paper>
      </Box>
    </ListItem>
  );
};

export default Message;