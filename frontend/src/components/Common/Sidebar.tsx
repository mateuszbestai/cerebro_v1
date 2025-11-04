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
  RocketLaunch as RocketIcon,
  Chat as ChatIcon,
  Description as ReportIcon,
  Storage as DatabaseIcon,
  Timeline as TimelineIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
  Bolt as BoltIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant?: 'permanent' | 'persistent' | 'temporary';
}

const drawerWidth = 260;

const Sidebar: React.FC<SidebarProps> = ({ open, onClose, variant = 'permanent' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { text: 'Solutions Hub', icon: <RocketIcon />, path: '/' },
    { text: 'Database Assistant', icon: <ChatIcon />, path: '/solutions/db' },
    { text: 'Real-Time Preview', icon: <BoltIcon />, path: '/solutions/realtime' },
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
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          mt: 8,
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text)',
          borderRight: '1px solid var(--border)',
          backdropFilter: 'blur(12px)',
        },
      }}
    >
      <Box sx={{ overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, px: 3 }}>
          <Typography variant="caption" sx={{ color: 'var(--text-muted)', letterSpacing: '0.18em' }}>
            NAVIGATION
          </Typography>
        </Box>
        
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  '&.Mui-selected': {
                    color: 'var(--text)',
                    backgroundColor: 'rgba(118,185,0,0.14)',
                    '& .MuiListItemIcon-root': {
                      color: 'var(--primary)',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(118,185,0,0.08)',
                    color: 'var(--text)',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: location.pathname === item.path ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                  primary={item.text}
                />
                {item.text === 'Database Assistant' && (
                  <Chip size="small" label="AI" color="primary" />
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        
        <Box sx={{ flexGrow: 1 }} />
        
        <Divider sx={{ borderColor: 'rgba(44,53,47,0.6)' }} />
        
        <List>
          {bottomMenuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  '&:hover': {
                    backgroundColor: 'rgba(118,185,0,0.08)',
                    color: 'var(--text)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'var(--text-muted)' }}>{item.icon}</ListItemIcon>
                <ListItemText primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
            Version 1.0.0
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
