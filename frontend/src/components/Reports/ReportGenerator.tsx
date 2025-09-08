import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import { apiClient } from '../../services/api';

interface ReportGeneratorProps {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ open, onClose, onGenerated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('pdf');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!title) {
      setError('Title is required');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      await apiClient.generateReport({
        title,
        description,
        format,
        include_charts: includeCharts,
      });
      
      onGenerated();
      handleClose();
    } catch (err) {
      setError('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setFormat('pdf');
    setIncludeCharts(true);
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Generate New Report</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <TextField
            label="Report Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
          />
          
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
          
          <FormControl fullWidth>
            <InputLabel>Format</InputLabel>
            <Select value={format} onChange={(e) => setFormat(e.target.value)}>
              <MenuItem value="pdf">PDF</MenuItem>
              <MenuItem value="html">HTML</MenuItem>
              <MenuItem value="markdown">Markdown</MenuItem>
              <MenuItem value="docx">Word Document</MenuItem>
            </Select>
          </FormControl>
          
          <FormControlLabel
            control={
              <Checkbox
                checked={includeCharts}
                onChange={(e) => setIncludeCharts(e.target.checked)}
              />
            }
            label="Include charts and visualizations"
          />
          
          <Typography variant="caption" color="text.secondary">
            The report will be generated based on your recent analysis results
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleGenerate}
          variant="contained"
          disabled={generating}
        >
          {generating ? 'Generating...' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportGenerator;