import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Alert,
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
import { useDatabase } from '../../hooks/useDatabase';

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
      <Alert 
        severity="info" 
        sx={{ m: 2, mb: 0 }}
        action={
          <Button color="inherit" size="small" onClick={onConnect}>
            Connect Database
          </Button>
        }
      >
        No database connected. Connect to a database to enable SQL analysis features.
      </Alert>
    );
  }

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: 2, 
        m: 2,
        mb: 0,
        bgcolor: 'background.default',
        borderBottom: '1px solid',
        borderColor: 'divider'
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
            <IconButton size="small" onClick={() => setShowDetails(!showDetails)}>
              <InfoIcon />
            </IconButton>
          </Tooltip>

          {/* Refresh Button */}
          {isConnected && (
            <Tooltip title="Refresh Tables">
              <IconButton size="small" onClick={refreshTables}>
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
      <Collapse in={showDetails && isConnected && databaseInfo}>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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