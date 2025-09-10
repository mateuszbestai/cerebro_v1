import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Provider } from 'react-redux';
import { store } from './store';

// Components
import Layout from './components/Common/Layout';
import ChatInterface from './components/Chat/ChatInterface';
import AnalysisResults from './components/Analysis/AnalysisResults';
import ReportViewer from './components/Reports/ReportViewer';
import ConnectionDialog from './components/Database/ConnectionDialog';
import TablesDashboard from './components/Database/TablesDashboard';
import DatabaseStatus from './components/Database/DatabaseStatus.tsx';

// Contexts
import { DatabaseProvider } from './contexts/DatabaseContext';
import { ChatProvider } from './contexts/ChatContext';

// Hooks
import { useDatabase } from './contexts/DatabaseContext';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0078D4',
    },
    secondary: {
      main: '#40E0D0',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function AppContent() {
  const { isConnected } = useDatabase();
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    // Show connection dialog on first load if not connected
    if (!isConnected && showWelcome) {
      const timer = setTimeout(() => {
        setConnectionDialogOpen(true);
        setShowWelcome(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, showWelcome]);


  return (
    <>
      {/* Database Status Bar */}
      <DatabaseStatus onConnect={() => setConnectionDialogOpen(true)} />
      
      {/* Connection Dialog */}
      <ConnectionDialog
        open={connectionDialogOpen}
        onClose={() => setConnectionDialogOpen(false)}
      />

      {/* Main Routes */}
      <Routes>
        <Route path="/" element={<ChatInterface />} />
        <Route path="/database" element={<TablesDashboard />} />
        <Route path="/analysis" element={<AnalysisResults />} />
        <Route path="/reports" element={<ReportViewer />} />
        <Route path="/visualizations" element={<div>Visualizations Page</div>} />
        <Route path="/settings" element={<div>Settings Page</div>} />
        <Route path="/help" element={<div>Help Page</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <DatabaseProvider>
          <ChatProvider>
            <Router>
              <Layout>
                <AppContent />
              </Layout>
            </Router>
          </ChatProvider>
        </DatabaseProvider>
      </ThemeProvider>
    </Provider>
  );
}

export default App;