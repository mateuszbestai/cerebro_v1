import React, { useState } from 'react';
import { Box, Container, useTheme, useMediaQuery } from '@mui/material';
import Header from './Header';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleDrawerToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        background: 'radial-gradient(circle at top left, rgba(118,185,0,0.12), transparent 45%), var(--bg)',
      }}
    >
      <Header onMenuClick={handleDrawerToggle} />
      
      <Sidebar 
        open={sidebarOpen} 
        onClose={handleDrawerToggle}
        variant={isMobile ? 'temporary' : 'persistent'}
      />
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: { xs: 10, md: 12 },
          pb: 6,
          px: { xs: 2, md: 5 },
          ml: sidebarOpen && !isMobile ? '260px' : 0,
          transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            maxWidth: '1280px',
            mx: 'auto',
            px: 0,
          }}
        >
          {children}
        </Container>
      </Box>
    </Box>
  );
};

export default Layout;
