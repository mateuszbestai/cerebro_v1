import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Collapse,
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useDatabase } from '../../contexts/DatabaseContext';
import { alpha, useTheme } from '@mui/material/styles';

interface DatabaseStatusProps {
  onConnect: () => void;
}

const DatabaseStatus: React.FC<DatabaseStatusProps> = ({ onConnect }) => {
  const { 
    isConnected, 
    isConnecting, 
    error, 
    databaseInfo, 
    tables, 
    selectedTables,
    disconnect,
    refreshTables 
  } = useDatabase();
  const theme = useTheme();
  
  const [showDetails, setShowDetails] = React.useState(false);

  const getStatusColor = () => {
    if (isConnecting) return 'warning';
    if (isConnected) return 'success';
    if (error) return 'error';
    return 'default';
  };

  const getStatusIcon = () => {
    if (isConnecting) return <WarningIcon />;
    if (isConnected) return <ConnectedIcon />;
    if (error) return <ErrorIcon />;
    return <DatabaseIcon />;
  };

  const getStatusText = () => {
    if (isConnecting) return 'Connecting...';
    if (isConnected && databaseInfo) return `Connected to ${databaseInfo.database_name}`;
    if (error) return 'Connection Failed';
    return 'Not Connected';
  };

  if (!isConnected && !error && !isConnecting) {
    return (
      <Paper
        elevation={0}
        sx={{
          m: 2,
          mb: 0,
          p: 2,
          borderRadius: 'var(--radius)',
          border: '1px dashed rgba(118,185,0,0.35)',
          background: 'rgba(26, 31, 30, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ color: 'var(--text)', mb: 0.5 }}>
            No database connected
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-dim)' }}>
            Connect to unlock SQL analysis and contextual insights inside Cerebro.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          onClick={onConnect}
          startIcon={<AddIcon />}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>
      </Paper>
    );
  }

  const actionIconStyles = {
    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08),
    color: theme.palette.primary.main,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
    transition: 'background-color 0.2s ease',
    '&:hover': {
      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.25 : 0.15),
    },
  };

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: 2, 
        m: 2,
        mb: 0,
        bgcolor: 'rgba(17, 22, 20, 0.85)',
        border: '1px solid rgba(44,53,47,0.9)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-1)'
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" alignItems="center" gap={2}>
          {/* Status Indicator */}
          <Chip
            icon={getStatusIcon()}
            label={getStatusText()}
            color={getStatusColor() as any}
            variant={isConnected ? 'filled' : 'outlined'}
          />

          {/* Table Selection Info */}
          {isConnected && (
            <>
              <Typography variant="body2" color="text.secondary">
                {tables.length} tables available
              </Typography>
              
              {selectedTables.length > 0 && (
                <Chip
                  label={`${selectedTables.length} selected`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </>
          )}

          {/* Error Message */}
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Box>

        <Box display="flex" alignItems="center" gap={1}>
          {/* Show Details Button */}
          <Tooltip title="Show Details">
            <IconButton
              size="small"
              onClick={() => setShowDetails(!showDetails)}
              sx={actionIconStyles}
            >
              <InfoIcon />
            </IconButton>
          </Tooltip>

          {/* Refresh Button */}
          {isConnected && (
            <Tooltip title="Refresh Tables">
              <IconButton
                size="small"
                onClick={refreshTables}
                sx={actionIconStyles}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* Connect/Disconnect Button */}
          {isConnected ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={disconnect}
              startIcon={<CloseIcon />}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              size="small"
              variant="contained"
              onClick={onConnect}
              startIcon={<AddIcon />}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Database'}
            </Button>
          )}
        </Box>
      </Box>

      {/* Expandable Details Section */}
      <Collapse in={showDetails && isConnected && !!databaseInfo}>
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: 'rgba(26,31,30,0.75)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(44,53,47,0.8)',
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Connection Details
          </Typography>
          <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Database
              </Typography>
              <Typography variant="body2">
                {databaseInfo?.database_name}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Server Version
              </Typography>
              <Typography variant="body2">
                {databaseInfo?.server_version.split(' ')[0]}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Tables
              </Typography>
              <Typography variant="body2">
                {databaseInfo?.tables_count}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Database Size
              </Typography>
              <Typography variant="body2">
                {databaseInfo?.total_size_mb ? 
                  `${(databaseInfo.total_size_mb / 1024).toFixed(2)} GB` : 
                  'N/A'
                }
              </Typography>
            </Box>
          </Box>
          
          {selectedTables.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Selected Tables for Analysis
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                {selectedTables.map(table => (
                  <Chip
                    key={table}
                    label={table}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default DatabaseStatus;
