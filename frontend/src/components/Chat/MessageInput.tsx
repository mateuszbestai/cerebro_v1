import React, { useState, KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  IconButton,
  InputAdornment,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Typography,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  QueryStats as QueryStatsIcon,
  Storage as DatabaseIcon,
  TableChart as TableIcon,
  Analytics as AnalyticsIcon,
  Description as ReportIcon,
  Help as HelpIcon,
} from '@mui/icons-material';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  showDatabaseHint?: boolean;
  selectedTables?: string[];
}

interface QueryTemplate {
  label: string;
  query: string;
  icon: React.ReactNode;
  requiresTable?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ 
  onSendMessage, 
  disabled,
  showDatabaseHint = false,
  selectedTables = []
}) => {
  const [message, setMessage] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [showHelp, setShowHelp] = useState(false);

  const queryTemplates: QueryTemplate[] = [
    {
      label: 'Show all tables',
      query: 'Show me all tables in the database with their row counts',
      icon: <DatabaseIcon />,
    },
    {
      label: 'Analyze table structure',
      query: selectedTables.length > 0 
        ? `Analyze the structure of the ${selectedTables[0]} table`
        : 'Analyze the structure of [table_name] table',
      icon: <TableIcon />,
      requiresTable: true,
    },
    {
      label: 'Show sample data',
      query: selectedTables.length > 0
        ? `Show me 10 sample rows from the ${selectedTables[0]} table`
        : 'Show me sample data from [table_name]',
      icon: <QueryStatsIcon />,
      requiresTable: true,
    },
    {
      label: 'Data statistics',
      query: selectedTables.length > 0
        ? `Generate statistics and insights for the ${selectedTables[0]} table`
        : 'Generate statistics for [table_name]',
      icon: <AnalyticsIcon />,
      requiresTable: true,
    },
    {
      label: 'Find relationships',
      query: 'Show me the relationships between tables in the database',
      icon: <DatabaseIcon />,
    },
    {
      label: 'Generate report',
      query: selectedTables.length > 0
        ? `Generate a comprehensive report for the ${selectedTables[0]} table`
        : 'Generate a report summarizing the database',
      icon: <ReportIcon />,
    },
  ];

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

  const handleTemplateClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleTemplateSelect = (template: QueryTemplate) => {
    setMessage(template.query);
    setAnchorEl(null);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const getPlaceholder = () => {
    if (!showDatabaseHint) {
      return 'Ask a question...';
    }
    
    if (selectedTables.length > 0) {
      return `Ask about ${selectedTables.join(', ')}...`;
    }
    
    return 'Ask about your database...';
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Database Context Hint */}
      {showDatabaseHint && selectedTables.length > 0 && (
        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Focusing on:
          </Typography>
          {selectedTables.map(table => (
            <Chip 
              key={table}
              label={table}
              size="small"
              variant="outlined"
              icon={<TableIcon />}
            />
          ))}
        </Box>
      )}

      <TextField
        fullWidth
        multiline
        maxRows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={getPlaceholder()}
        disabled={disabled}
        variant="outlined"
        InputProps={{
          startAdornment: showDatabaseHint && (
            <InputAdornment position="start">
              <DatabaseIcon color="action" fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Box display="flex" alignItems="center">
                {/* Query Templates */}
                <Tooltip title="Query Templates">
                  <IconButton
                    size="small"
                    onClick={handleTemplateClick}
                    disabled={disabled}
                  >
                    <QueryStatsIcon />
                  </IconButton>
                </Tooltip>

                {/* Help */}
                <Tooltip title="Help">
                  <IconButton
                    size="small"
                    onClick={() => setShowHelp(!showHelp)}
                  >
                    <HelpIcon />
                  </IconButton>
                </Tooltip>

                {/* Attach File */}
                <Tooltip title="Attach File">
                  <IconButton size="small" disabled={disabled}>
                    <AttachFileIcon />
                  </IconButton>
                </Tooltip>

                {/* Send Button */}
                <IconButton
                  onClick={handleSend}
                  disabled={!message.trim() || disabled}
                  color="primary"
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </InputAdornment>
          ),
        }}
      />

      {/* Query Templates Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <MenuItem disabled>
          <Typography variant="caption">Query Templates</Typography>
        </MenuItem>
        {queryTemplates.map((template, index) => (
          <MenuItem
            key={index}
            onClick={() => handleTemplateSelect(template)}
            disabled={template.requiresTable && selectedTables.length === 0}
          >
            <ListItemIcon>{template.icon}</ListItemIcon>
            <ListItemText>
              {template.label}
              {template.requiresTable && selectedTables.length === 0 && (
                <Typography variant="caption" color="text.secondary" display="block">
                  (Select a table first)
                </Typography>
              )}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* Help Text */}
      {showHelp && (
        <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Tips:</strong><br />
            • Press Enter to send, Shift+Enter for new line<br />
            • Use templates for common queries<br />
            • Select tables in Database tab for focused analysis<br />
            • Ask natural language questions about your data<br />
            • Examples: "Show top 10 customers", "Analyze sales trends", "Find duplicates"
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default MessageInput;