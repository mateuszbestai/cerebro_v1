import React from 'react';
import { Box, List } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import Message from './Message';
import { Message as MessageType } from '../../types';

interface MessageListProps {
  messages: MessageType[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const theme = useTheme();
  const listBackground = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.03)
    : theme.palette.grey[50];
  const borderColor = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.08)
    : theme.palette.grey[200];

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 2,
        backgroundColor: listBackground,
        borderTop: `1px solid ${borderColor}`,
      }}
    >
      <List sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </List>
    </Box>
  );
};

export default MessageList;
