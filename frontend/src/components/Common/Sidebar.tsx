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
  Collapse,
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
  AccountTree as GDMIcon,
  AutoGraph as AutoGraphIcon,
  Insights as InsightsIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant?: 'permanent' | 'persistent' | 'temporary';
}

const drawerWidth = 260;

type NavItem = {
  text: string;
  icon: React.ReactNode;
  path?: string;
  chip?: string;
  children?: NavItem[];
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type NavigationVariant = 'solutionsHub' | 'databaseAssistant' | 'default';

type NavigationConfig = {
  heading: string;
  sections: NavSection[];
};

const navigationVariants: Record<NavigationVariant, NavigationConfig> = {
  solutionsHub: {
    heading: 'SOLUTIONS HUB',
    sections: [
      {
        label: 'Launch Workflows',
        items: [
          { text: 'Overview', icon: <RocketIcon />, path: '/' },
          { text: 'Database Assistant', icon: <ChatIcon />, path: '/solutions/db', chip: 'AI' },
          { text: 'Real-Time Preview', icon: <BoltIcon />, path: '/solutions/realtime' },
          { text: 'AutoML + Forecasts', icon: <AutoGraphIcon />, path: '/solutions/automl', chip: 'New' },
        ],
      },
    ],
  },
  databaseAssistant: {
    heading: 'DATABASE ASSISTANT',
    sections: [
      {
        label: 'Assistant Suite',
        items: [
          { text: 'Chat Workspace', icon: <ChatIcon />, path: '/solutions/db', chip: 'AI' },
          {
            text: 'Schema Explorer',
            icon: <DatabaseIcon />,
            path: '/database',
            children: [
              { text: 'GDM Results', icon: <GDMIcon />, path: '/solutions/gdm' },
              {
                text: 'AutoML + AI Forecasts',
                icon: (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AutoGraphIcon fontSize="small" />
                    <InsightsIcon fontSize="small" />
                  </Box>
                ),
                path: '/solutions/automl',
                chip: 'Suite',
              },
            ],
          },
          { text: 'Visualizations', icon: <TimelineIcon />, path: '/visualizations' },
        ],
      },
      {
        label: 'Deliverables',
        items: [
          { text: 'Report Builder', icon: <ReportIcon />, path: '/reports' },
        ],
      },
    ],
  },
  default: {
    heading: 'NAVIGATION',
    sections: [
      {
        label: 'General',
        items: [
          { text: 'Solutions Hub', icon: <RocketIcon />, path: '/' },
          { text: 'Database Assistant', icon: <ChatIcon />, path: '/solutions/db', chip: 'AI' },
          {
            text: 'Schema Explorer',
            icon: <DatabaseIcon />,
            path: '/database',
            children: [
              { text: 'GDM Results', icon: <GDMIcon />, path: '/solutions/gdm' },
              {
                text: 'AutoML + AI Forecasts',
                icon: (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AutoGraphIcon fontSize="small" />
                    <InsightsIcon fontSize="small" />
                  </Box>
                ),
                path: '/solutions/automl',
                chip: 'Suite',
              },
            ],
          },
          { text: 'Real-Time Preview', icon: <BoltIcon />, path: '/solutions/realtime' },
          { text: 'Reports', icon: <ReportIcon />, path: '/reports' },
          { text: 'Visualizations', icon: <TimelineIcon />, path: '/visualizations' },
        ],
      },
    ],
  },
};

const Sidebar: React.FC<SidebarProps> = ({ open, onClose, variant = 'permanent' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const getNavigationVariant = (): NavigationVariant => {
    if (location.pathname === '/') return 'solutionsHub';

    const databaseAssistantPaths = [
      '/solutions/db',
      '/solutions/gdm',
      '/solutions/automl',
      '/database',
      '/reports',
      '/visualizations',
    ];
    const isDatabaseAssistantRoute = databaseAssistantPaths.some(
      (path) =>
        location.pathname === path || location.pathname.startsWith(`${path}/`),
    );

    if (isDatabaseAssistantRoute) {
      return 'databaseAssistant';
    }

    return 'default';
  };

  const navConfig = navigationVariants[getNavigationVariant()];

  const bottomMenuItems = [
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
    { text: 'Help', icon: <HelpIcon />, path: '/help' },
  ];

  const isItemActive = (item: NavItem): boolean => {
    if (item.path) {
      if (location.pathname === item.path) return true;
      if (location.pathname.startsWith(`${item.path}/`)) return true;
    }
    return (item.children || []).some(isItemActive);
  };

  const renderNavItems = (items: NavItem[], depth: number = 0) =>
    items.map((item) => {
      const hasChildren = Boolean(item.children && item.children.length > 0);
      const isActive = isItemActive(item);
      const isOpen = expanded[item.text] ?? isActive ?? false;

      const handleClick = () => {
        if (hasChildren) {
          setExpanded((prev) => ({ ...prev, [item.text]: !isOpen }));
        }
        if (item.path) {
          navigate(item.path);
          if (variant === 'temporary') onClose();
        }
      };

      return (
        <React.Fragment key={`${item.text}-${depth}`}>
          <ListItem disablePadding>
            <ListItemButton
              selected={isActive}
              onClick={handleClick}
              sx={{
                mx: 1,
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                pl: depth ? 3 + depth * 1.5 : 2,
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
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  minWidth: 36,
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                primary={item.text}
              />
              {item.chip && (
                <Chip size="small" label={item.chip} color="primary" />
              )}
            </ListItemButton>
          </ListItem>
          {hasChildren && (
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <List disablePadding>
                {renderNavItems(item.children || [], depth + 1)}
              </List>
            </Collapse>
          )}
        </React.Fragment>
      );
    });

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
            {navConfig.heading}
          </Typography>
        </Box>

        {navConfig.sections.map((section) => (
          <Box key={section.label} sx={{ mb: 1 }}>
            <Typography
              variant="overline"
              sx={{
                color: 'var(--text-muted)',
                letterSpacing: '0.2em',
                fontSize: '0.65rem',
                px: 3,
              }}
            >
              {section.label}
            </Typography>
            <List>
              {renderNavItems(section.items)}
            </List>
          </Box>
        ))}
        
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
