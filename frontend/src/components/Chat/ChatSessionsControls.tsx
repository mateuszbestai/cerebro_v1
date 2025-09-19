import React from 'react';
import { Box, Button, IconButton, Menu, MenuItem, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useChat } from '../../contexts/ChatContext';

const ChatSessionsControls: React.FC = () => {
  const { sessions, currentSessionId, newSession, switchSession, renameSession } = useChat();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');

  const current = sessions.find(s => s.id === currentSessionId);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => { setAnchorEl(null); setRenamingId(null); };

  const handleRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setTitle(currentTitle);
  };

  const commitRename = () => {
    if (renamingId) renameSession(renamingId, title.trim() || 'Untitled Chat');
    setRenamingId(null);
    setTitle('');
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Tooltip title="New Chat">
        <IconButton size="small" onClick={() => newSession()}>
          <AddIcon />
        </IconButton>
      </Tooltip>

      <Button size="small" variant="outlined" onClick={handleOpen} endIcon={<MoreVertIcon />}>
        {current?.title || 'Chats'}
      </Button>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {sessions.map(s => (
          <MenuItem key={s.id} onClick={() => { switchSession(s.id); handleClose(); }}>
            {s.title}
            <IconButton size="small" sx={{ ml: 'auto' }} onClick={(e) => { e.stopPropagation(); handleRename(s.id, s.title); }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>

      {renamingId && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField size="small" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button size="small" onClick={commitRename}>Save</Button>
          <Button size="small" onClick={() => setRenamingId(null)}>Cancel</Button>
        </Box>
      )}
    </Box>
  );
};

export default ChatSessionsControls;
