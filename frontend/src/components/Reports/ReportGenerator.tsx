import React, { useEffect, useState } from 'react';
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
  LinearProgress,
} from '@mui/material';
import { apiClient } from '../../services/api';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { useModelOptions } from '../../contexts/ModelContext';

interface ReportGeneratorProps {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

const POLL_INTERVAL_MS = 1500;

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ open, onClose, onGenerated }) => {
  const latestAnalysis = useSelector((state: RootState) => state.analysis.history[0]);
  const { selectedModel } = useModelOptions();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'pdf' | 'html' | 'markdown' | 'docx'>('pdf');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // reset transient state when dialog closes
      setPreviewUrl(null);
      setCurrentReportId(null);
      setGenerating(false);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!title) {
      setError('Title is required');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const payload: any = {
        title,
        description,
        format,
        include_charts: includeCharts,
      };
      if (selectedModel?.id) {
        payload.model = selectedModel.id;
      }

      if (latestAnalysis) {
        payload.analysis_results = latestAnalysis;
        // also pass data if available for better summaries
        if (latestAnalysis.data) payload.data = latestAnalysis.data;
      }

      const res = await apiClient.generateReport(payload);
      setCurrentReportId(res.report_id);

      // Begin polling for completion and show preview when ready
      const poll = async () => {
        if (!res.report_id) return;
        try {
          const status = await apiClient.getReport(res.report_id);
          if (status.data.status === 'completed' && status.data.url) {
            setPreviewUrl(status.data.url);
            setGenerating(false);
            onGenerated();
          } else if (status.data.status === 'failed') {
            setError(status.data.error || 'Report generation failed');
            setGenerating(false);
          } else {
            setTimeout(poll, POLL_INTERVAL_MS);
          }
        } catch (e) {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };
      poll();
    } catch (err) {
      setError('Failed to generate report');
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setFormat('pdf');
    setIncludeCharts(true);
    setError('');
    setPreviewUrl(null);
    setCurrentReportId(null);
    onClose();
  };

  const renderPreview = () => {
    if (!previewUrl) return null;
    if (previewUrl.endsWith('.html')) {
      return (
        <iframe src={previewUrl} style={{ width: '100%', height: '70vh', border: 'none' }} />
      );
    }
    // For PDFs or other formats, just provide a link; browsers will preview PDF natively
    return (
      <Box>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Preview ready. Open the report in a new tab:
        </Typography>
        <Button variant="outlined" href={previewUrl} target="_blank">
          Open Report
        </Button>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Generate New Report</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {latestAnalysis ? (
            <Typography variant="caption" color="text.secondary">
              Using latest analysis as context for AI summary and content.
            </Typography>
          ) : (
            <Alert severity="info">No recent analysis found. The report will include only the provided title and description.</Alert>
          )}
          
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
            <Select value={format} onChange={(e) => setFormat(e.target.value as any)}>
              <MenuItem value="pdf">PDF</MenuItem>
              <MenuItem value="html">HTML (best for preview)</MenuItem>
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

          {generating && (
            <Box sx={{ mt: 1 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary">
                Generating report... {currentReportId ? `(ID: ${currentReportId})` : ''}
              </Typography>
            </Box>
          )}

          {renderPreview()}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
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
