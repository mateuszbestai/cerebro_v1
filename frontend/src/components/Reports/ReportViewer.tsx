import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
} from '@mui/icons-material';
import { apiClient, ReportResponse } from '../../services/api';
import LoadingSpinner from '../Common/LoadingSpinner';
import ReportGenerator from './ReportGenerator';

const ReportViewer: React.FC = () => {
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportResponse | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await apiClient.getReports();
      setReports(response.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (report: ReportResponse) => {
    setSelectedReport(report);
    setViewDialogOpen(true);
  };

  const handleDownload = async (reportId: string) => {
    try {
      const response = await apiClient.getReport(reportId);
      // Handle download
      window.open(response.data.url, '_blank');
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'generating':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading reports..." />;
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="h4">Reports</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setGeneratorOpen(true)}
        >
          Generate New Report
        </Button>
      </Box>

      <Grid container spacing={3}>
        {reports.map((report) => {
          const formatLabel = report.url ? (report.url.split('.').pop() || 'N/A').toUpperCase() : 'N/A';
          return (
            <Grid item xs={12} sm={6} md={4} key={report.report_id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {report.title}
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Chip
                      label={report.status}
                      color={getStatusColor(report.status) as any}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip
                      label={formatLabel}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Created: {new Date(report.created_at).toLocaleDateString()}
                  </Typography>
                </CardContent>
                <CardActions>
                  <IconButton
                    size="small"
                    onClick={() => handleView(report)}
                    disabled={report.status !== 'completed'}
                  >
                    <ViewIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDownload(report.report_id)}
                    disabled={report.status !== 'completed'}
                  >
                    <DownloadIcon />
                  </IconButton>
                  <IconButton size="small">
                    <ShareIcon />
                  </IconButton>
                  <IconButton size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <ReportGenerator
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerated={fetchReports}
      />

      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>{selectedReport?.title}</DialogTitle>
        <DialogContent>
          {/* Report content viewer would go here */}
          <Box sx={{ minHeight: 400 }}>
            <Typography>Report content preview...</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            onClick={() => selectedReport && handleDownload(selectedReport.report_id)}
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ReportViewer;