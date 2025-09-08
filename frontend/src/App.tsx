import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { store } from './store';
import Layout from './components/Common/Layout';
import ChatInterface from './components/Chat/ChatInterface';
import AnalysisResults from './components/Analysis/AnalysisResults';
import ReportViewer from './components/Reports/ReportViewer';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0078D4', // Azure blue
    },
    secondary: {
      main: '#40E0D0',
    },
    background: {
      default: '#F5F5F5',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<ChatInterface />} />
              <Route path="/analysis" element={<AnalysisResults />} />
              <Route path="/reports" element={<ReportViewer />} />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </Provider>
  );
};

export default App;