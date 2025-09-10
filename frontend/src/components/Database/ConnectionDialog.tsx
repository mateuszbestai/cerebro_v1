import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  IconButton,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Collapse,
  Link,
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error as ErrorIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { databaseApi } from '../../services/databaseApi';
import { useDatabase } from '../../contexts/DatabaseContext';

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ConnectionForm {
  server: string;
  database: string;
  username: string;
  password: string;
  port: number;
  driver: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectionTimeout: number;
}

const ConnectionDialog: React.FC<ConnectionDialogProps> = ({ open, onClose }) => {
  const { connect: connectToDatabase } = useDatabase();
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<ConnectionForm>({
    server: '',
    database: '',
    username: '',
    password: '',
    port: 1433,
    driver: '',
    encrypt: true,
    trustServerCertificate: true,
    connectionTimeout: 30,
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [availableDrivers, setAvailableDrivers] = useState<string[]>([]);
  const [recommendedDriver, setRecommendedDriver] = useState<string>('');
  const [connectionTested, setConnectionTested] = useState(false);

  const steps = ['Connection Details', 'Test Connection', 'Confirm'];

  useEffect(() => {
    if (open) {
      // Reset transient UI state when dialog opens
      setError('');
      setSuccess('');
      setTesting(false);
      setLoading(false);
      setConnectionTested(false);
      // Do not reset form here to preserve user input
      loadAvailableDrivers();
    }
  }, [open]);

  const loadAvailableDrivers = async () => {
    try {
      const response = await databaseApi.getAvailableDrivers();
      setAvailableDrivers(response.sql_drivers || []);
      setRecommendedDriver(response.recommended || '');
      
      if (response.recommended && !form.driver) {
        setForm(prev => ({ ...prev, driver: response.recommended || '' }));
      }
      
      if (!response.sql_drivers || response.sql_drivers.length === 0) {
        setError('No SQL Server ODBC drivers found. Please install ODBC Driver 17 or 18 for SQL Server.');
      }
    } catch (err) {
      console.error('Error loading drivers:', err);
    }
  };

  const handleChange = (field: keyof ConnectionForm) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
    setConnectionTested(false);
  };

  const validateForm = (): boolean => {
    if (!form.server) {
      setError('Server address is required');
      return false;
    }
    if (!form.database) {
      setError('Database name is required');
      return false;
    }
    if (!form.username) {
      setError('Username is required');
      return false;
    }
    if (!form.password) {
      setError('Password is required');
      return false;
    }
    return true;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) return;

    setTesting(true);
    setError('');
    setSuccess('');

    try {
      const response = await databaseApi.testConnection(form);
      
      if (response.success) {
        // Clear any stale errors from previous attempts
        setError('');
        setSuccess('Connection successful! Click \"Connect\" to proceed.');
        setConnectionTested(true);
        setActiveStep(2);
      } else {
        setError(response.message || 'Connection failed');
        
        // Provide helpful suggestions based on error
        if (response.message?.includes('timeout')) {
          setError(response.message + '\n\nTry: Check firewall settings and ensure the server is accessible.');
        } else if (response.message?.includes('Authentication')) {
          setError(response.message + '\n\nTry: Verify username and password are correct.');
        } else if (response.message?.includes('driver')) {
          setError(response.message + '\n\nTry: Install ODBC Driver for SQL Server from Microsoft.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      // Use the database context connect method which updates the global state
      await connectToDatabase(form);
      
      setSuccess('Connected successfully!');
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to connect';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setForm({
      server: '',
      database: '',
      username: '',
      password: '',
      port: 1433,
      driver: recommendedDriver,
      encrypt: true,
      trustServerCertificate: true,
      connectionTimeout: 30,
    });
    setError('');
    setSuccess('');
    setActiveStep(0);
    setConnectionTested(false);
    onClose();
  };

  const handleNext = () => {
    if (activeStep === 0 && validateForm()) {
      setActiveStep(1);
    } else if (activeStep === 1) {
      handleTestConnection();
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
    setError('');
    setSuccess('');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Connect to SQL Database</Typography>
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            icon={<ErrorIcon />}
            action={
              <IconButton size="small" onClick={() => setError('')}>
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            <Typography variant="body2" style={{ whiteSpace: 'pre-line' }}>
              {error}
            </Typography>
          </Alert>
        )}

        {success && (
          <Alert 
            severity="success" 
            sx={{ mb: 2 }}
            icon={<CheckCircle />}
          >
            {success}
          </Alert>
        )}

        {/* No drivers warning */}
        {availableDrivers.length === 0 && !loading && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No SQL Server drivers detected. 
            <Link href="https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server" target="_blank" sx={{ ml: 1 }}>
              Download ODBC Driver
            </Link>
          </Alert>
        )}

        <Box sx={{ minHeight: 350 }}>
          {activeStep === 0 && (
            <Box>
              <TextField
                fullWidth
                label="Server Address"
                value={form.server}
                onChange={handleChange('server')}
                margin="normal"
                required
                placeholder="your-server.database.windows.net"
                helperText="Azure SQL Server hostname or IP address"
              />

              <TextField
                fullWidth
                label="Database Name"
                value={form.database}
                onChange={handleChange('database')}
                margin="normal"
                required
                placeholder="your-database"
                helperText="The database to connect to"
              />

              <TextField
                fullWidth
                label="Username"
                value={form.username}
                onChange={handleChange('username')}
                margin="normal"
                required
                placeholder="sql-username"
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange('password')}
                margin="normal"
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Box sx={{ mt: 2 }}>
                <Button
                  startIcon={<SettingsIcon />}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  size="small"
                >
                  Advanced Settings
                </Button>
              </Box>

              <Collapse in={showAdvanced}>
                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <TextField
                    fullWidth
                    label="Port"
                    type="number"
                    value={form.port}
                    onChange={handleChange('port')}
                    margin="normal"
                    helperText="Default: 1433"
                  />

                  <FormControl fullWidth margin="normal">
                    <InputLabel>ODBC Driver</InputLabel>
                    <Select value={form.driver} onChange={handleChange('driver')}>
                      <MenuItem value="">Auto-detect</MenuItem>
                      {availableDrivers.map(driver => (
                        <MenuItem key={driver} value={driver}>
                          {driver} {driver === recommendedDriver && '(Recommended)'}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    fullWidth
                    label="Connection Timeout (seconds)"
                    type="number"
                    value={form.connectionTimeout}
                    onChange={handleChange('connectionTimeout')}
                    margin="normal"
                    helperText="Default: 30 seconds"
                  />

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={form.encrypt}
                        onChange={handleChange('encrypt')}
                      />
                    }
                    label="Use Encryption"
                  />

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={form.trustServerCertificate}
                        onChange={handleChange('trustServerCertificate')}
                      />
                    }
                    label="Trust Server Certificate"
                  />
                </Box>
              </Collapse>
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              {testing ? (
                <>
                  <CircularProgress size={60} />
                  <Typography variant="h6" sx={{ mt: 3 }}>
                    Testing Connection...
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Connecting to {form.server}
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6">Ready to Test Connection</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Click "Test Connection" to verify your settings
                  </Typography>
                  
                  <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1, textAlign: 'left' }}>
                    <Typography variant="subtitle2" gutterBottom>Connection Details:</Typography>
                    <Typography variant="body2">Server: {form.server}</Typography>
                    <Typography variant="body2">Database: {form.database}</Typography>
                    <Typography variant="body2">Username: {form.username}</Typography>
                    <Typography variant="body2">Port: {form.port}</Typography>
                    <Typography variant="body2">Driver: {form.driver || 'Auto-detect'}</Typography>
                  </Box>
                </>
              )}
            </Box>
          )}

          {activeStep === 2 && connectionTested && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircle sx={{ fontSize: 60, color: 'success.main' }} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Connection Test Successful!
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Click "Connect" to establish the connection and start exploring your database.
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading || testing}>
          Cancel
        </Button>
        
        {activeStep > 0 && (
          <Button onClick={handleBack} disabled={loading || testing}>
            Back
          </Button>
        )}

        {activeStep < 2 ? (
          <Button
            onClick={activeStep === 0 ? handleNext : handleTestConnection}
            variant="contained"
            disabled={loading || testing}
          >
            {activeStep === 0 ? 'Next' : 'Test Connection'}
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            variant="contained"
            disabled={loading || !connectionTested}
            startIcon={loading && <CircularProgress size={20} />}
          >
            Connect
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ConnectionDialog;