import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Provider } from 'react-redux';
import { store } from './store';

// Components
import Layout from './components/Common/Layout';
import ChatInterface from './components/Chat/ChatInterface';
import ReportViewer from './components/Reports/ReportViewer';
import ConnectionDialog from './components/Database/ConnectionDialog';
import TablesDashboard from './components/Database/TablesDashboard';
import DatabaseStatus from './components/Database/DatabaseStatus.tsx';
import VisualizationsDashboard from './components/Visualizations/VisualizationsDashboard';
import SolutionsHub from './pages/SolutionsHub';
import RealTimePreview from './pages/RealTimePreview';

// Contexts
import { DatabaseProvider } from './contexts/DatabaseContext';
import { ChatProvider } from './contexts/ChatContext';
import { ThemeModeProvider, useThemeMode } from './contexts/ThemeModeContext';
import { ModelProvider } from './contexts/ModelContext';

// Hooks
import { useDatabase } from './contexts/DatabaseContext';

function AppContent() {
  const { isConnected } = useDatabase();
  const location = useLocation();
  const isDatabaseExperience =
    location.pathname.startsWith('/solutions/db') || location.pathname.startsWith('/database');
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    if (!isDatabaseExperience) {
      setConnectionDialogOpen(false);
      return;
    }

    // Show connection dialog on first visit to the database experience
    if (!isConnected && showWelcome) {
      const timer = setTimeout(() => {
        setConnectionDialogOpen(true);
        setShowWelcome(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, showWelcome, isDatabaseExperience]);


  return (
    <>
      {isDatabaseExperience && (
        <>
          <DatabaseStatus onConnect={() => setConnectionDialogOpen(true)} />
          <ConnectionDialog
            open={connectionDialogOpen}
            onClose={() => setConnectionDialogOpen(false)}
          />
        </>
      )}

      {/* Main Routes */}
      <Routes>
        <Route path="/" element={<SolutionsHub />} />
        <Route path="/solutions/db" element={<ChatInterface />} />
        <Route path="/solutions/realtime" element={<RealTimePreview />} />
        <Route path="/database" element={<TablesDashboard />} />
        <Route path="/reports" element={<ReportViewer />} />
        <Route path="/visualizations" element={<VisualizationsDashboard />} />
        <Route path="/settings" element={<div>Settings Page</div>} />
        <Route path="/help" element={<div>Help Page</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function AppWithTheme() {
  const { mode } = useThemeMode();
  const theme = useMemo(() => {
    const isDark = mode === 'dark';
    const paletteTokens = {
      primary: '#76B900',
      secondary: '#00B4D8',
      bgDark: '#0B0F0D',
      bgLight: '#f5f7f5',
      surfaceDark: '#111614',
      surfaceLight: '#ffffff',
      textPrimaryDark: '#E6F0E6',
      textSecondaryDark: '#A9B7A9',
      textDisabledDark: '#7E8A7E',
      textPrimaryLight: '#0B0F0D',
      textSecondaryLight: '#4A5750',
      textDisabledLight: '#7A857D',
      dividerDark: '#2C352F',
      dividerLight: '#D5DED2',
    };

    const palette = {
      mode: isDark ? 'dark' : 'light',
      primary: { main: paletteTokens.primary, contrastText: '#0B0F0D' },
      secondary: { main: paletteTokens.secondary, contrastText: '#0B0F0D' },
      background: {
        default: isDark ? paletteTokens.bgDark : paletteTokens.bgLight,
        paper: isDark ? paletteTokens.surfaceDark : paletteTokens.surfaceLight,
      },
      text: {
        primary: isDark ? paletteTokens.textPrimaryDark : paletteTokens.textPrimaryLight,
        secondary: isDark ? paletteTokens.textSecondaryDark : paletteTokens.textSecondaryLight,
        disabled: isDark ? paletteTokens.textDisabledDark : paletteTokens.textDisabledLight,
      },
      divider: isDark ? paletteTokens.dividerDark : paletteTokens.dividerLight,
    } as const;

    return createTheme({
      palette,
      shape: {
        borderRadius: 16,
      },
      typography: {
        fontFamily: '"Inter","IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        h1: { fontWeight: 600, letterSpacing: '-0.04em' },
        h2: { fontWeight: 600, letterSpacing: '-0.035em' },
        h3: { fontWeight: 500, letterSpacing: '-0.02em' },
        h4: { fontWeight: 500, letterSpacing: '-0.015em' },
        body1: { lineHeight: 1.6 },
        body2: { lineHeight: 1.55, color: palette.text.secondary },
        button: { textTransform: 'none', fontWeight: 600 },
        caption: { color: palette.text.secondary },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: {
              backgroundColor: palette.background.default,
              color: palette.text.primary,
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundColor: palette.background.paper,
              backdropFilter: `blur(${isDark ? '12px' : '0px'})`,
              borderRadius: 'var(--radius)',
              border: isDark ? '1px solid var(--border)' : '1px solid rgba(11,15,13,0.05)',
              boxShadow: isDark ? 'var(--shadow-1)' : '0 10px 30px rgba(11,15,13,0.08)',
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: '999px',
              paddingInline: '18px',
              paddingBlock: '10px',
              transition: 'transform 0.18s ease-out, box-shadow 0.18s ease-out',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: isDark ? 'var(--shadow-2)' : '0 12px 30px rgba(11,15,13,0.12)',
              },
              '&:focus-visible': {
                outline: 'none',
                boxShadow: `0 0 0 3px rgba(44, 122, 59, 0.45)`,
              },
            },
            containedSecondary: {
              color: '#0B0F0D',
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              borderRadius: 'var(--radius-sm)',
              fontFamily: '"IBM Plex Mono","Roboto Mono",monospace',
              letterSpacing: '0.04em',
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: isDark ? 'rgba(17,22,20,0.85)' : '#0B0F0D',
              color: palette.text.primary,
              borderRadius: 8,
              border: '1px solid var(--border)',
            },
            arrow: {
              color: isDark ? 'rgba(17,22,20,0.85)' : '#0B0F0D',
            },
          },
        },
      },
    });
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ModelProvider>
        <DatabaseProvider>
          <ChatProvider>
            <Router>
              <Layout>
                <AppContent />
              </Layout>
            </Router>
          </ChatProvider>
        </DatabaseProvider>
      </ModelProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeModeProvider>
        <AppWithTheme />
      </ThemeModeProvider>
    </Provider>
  );
}

export default App;
