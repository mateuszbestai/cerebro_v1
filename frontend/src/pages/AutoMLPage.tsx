/**
 * AutoML Page
 *
 * Main page for the AutoML wizard interface.
 * Can be accessed directly or from GDM results.
 */

import React from 'react';
import { Box, Container, Typography, Paper, Breadcrumbs, Link } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';

import { AutoMLWizard } from '../components/AutoML';

const AutoMLPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const gdmJobId = searchParams.get('gdmJobId') || undefined;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          component={RouterLink}
          to="/"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          underline="hover"
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
          Home
        </Link>
        <Typography color="text.primary" sx={{ display: 'flex', alignItems: 'center' }}>
          <AutoGraphIcon sx={{ mr: 0.5 }} fontSize="small" />
          AutoML
        </Typography>
      </Breadcrumbs>

      {/* Page Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          AutoML Wizard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Build machine learning models without writing code. Our AI will analyze your data and train the best model for your use case.
        </Typography>
      </Box>

      {/* Wizard Container */}
      <Paper elevation={1} sx={{ p: 0 }}>
        <AutoMLWizard
          gdmJobId={gdmJobId}
          onComplete={(jobId) => {
            console.log('AutoML completed:', jobId);
          }}
        />
      </Paper>
    </Container>
  );
};

export default AutoMLPage;
