import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Button,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Brightness4,
  Brightness7,
  Launch as LaunchIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../../contexts/ThemeModeContext';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { mode, toggle } = useThemeMode();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: 'rgba(11, 15, 13, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(44, 53, 47, 0.9)',
      }}
    >
      <Toolbar sx={{ gap: 2 }}>
        <IconButton
          edge="start"
          color="primary"
          aria-label="menu"
          onClick={onMenuClick}
          sx={{ mr: 1 }}
        >
          <MenuIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{
              textDecoration: 'none',
              color: 'var(--text)',
              fontWeight: 600,
              letterSpacing: '-0.04em',
            }}
          >
            Cerebro
          </Typography>
          <Chip
            label="ALPHA"
            size="small"
            sx={{
              borderRadius: '999px',
              borderColor: 'rgba(118,185,0,0.45)',
              color: 'var(--text)',
              backgroundColor: 'rgba(118,185,0,0.16)',
              letterSpacing: '0.18em',
            }}
            variant="outlined"
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexGrow: 1 }}>
          <Button
            component={RouterLink}
            to="/"
            color="inherit"
            sx={{ color: 'var(--text-dim)' }}
          >
            Solutions
          </Button>
          <Button
            component={RouterLink}
            to="/solutions/db"
            color="inherit"
            sx={{ color: 'var(--text-dim)' }}
          >
            Database Assistant
          </Button>
          <Button
            component={RouterLink}
            to="/solutions/realtime"
            color="inherit"
            sx={{ color: 'var(--text-dim)' }}
          >
            Real-Time Preview
          </Button>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title="Toggle theme">
            <IconButton color="inherit" onClick={toggle}>
              {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            color="secondary"
            endIcon={<LaunchIcon />}
            component={RouterLink}
            to="/docs"
            disabled
            sx={{ borderColor: 'rgba(0,180,216,0.4)', color: 'var(--brand-bestai)' }}
          >
            Docs soon
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
