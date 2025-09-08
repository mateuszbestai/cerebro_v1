import React from 'react';
import { Box, List } from '@mui/material';
import Message from './Message';
import { Message as MessageType } from '../../types';

interface MessageListProps {
  messages: MessageType[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 2,
        backgroundColor: '#f5f5f5',
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