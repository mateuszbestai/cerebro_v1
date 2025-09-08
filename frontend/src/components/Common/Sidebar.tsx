import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Assessment as AssessmentIcon,
  Description as ReportIcon,
  Storage as DatabaseIcon,
  Timeline as TimelineIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant?: 'permanent' | 'persistent' | 'temporary';
}

const Sidebar: React.FC<SidebarProps> = ({ open, onClose, variant = 'permanent' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { text: 'Chat', icon: <ChatIcon />, path: '/' },
    { text: 'Analysis', icon: <AssessmentIcon />, path: '/analysis' },
    { text: 'Reports', icon: <ReportIcon />, path: '/reports' },
    { text: 'Database', icon: <DatabaseIcon />, path: '/database' },
    { text: 'Visualizations', icon: <TimelineIcon />, path: '/visualizations' },
  ];

  const bottomMenuItems = [
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
    { text: 'Help', icon: <HelpIcon />, path: '/help' },
  ];

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width: 240,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 240,
          boxSizing: 'border-box',
          mt: 8,
        },
      }}
    >
      <Box sx={{ overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            NAVIGATION
          </Typography>
        </Box>
        
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
              >
                <ListItemIcon sx={{ color: location.pathname === item.path ? 'primary.main' : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
                {item.text === 'Chat' && (
                  <Chip size="small" label="AI" color="primary" />
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        
        <Box sx={{ flexGrow: 1 }} />
        
        <Divider />
        
        <List>
          {bottomMenuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton onClick={() => navigate(item.path)}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Version 1.0.0
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default Sidebar;