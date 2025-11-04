import React from 'react';
import { Box, Typography, Stack, Button } from '@mui/material';
import SolutionsGrid from '../components/Solutions/SolutionsGrid';
import { solutions } from '../config/solutions';
import { Link as RouterLink } from 'react-router-dom';

const SolutionsHub: React.FC = () => {
  const availableSolutions = solutions.filter((solution) => solution.state !== 'disabled');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6, py: 6 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 3,
          background: 'linear-gradient(135deg, rgba(118,185,0,0.12) 0%, rgba(0,180,216,0.12) 100%)',
          borderRadius: 'var(--radius)',
          border: '1px solid rgba(44, 53, 47, 0.8)',
          padding: { xs: 3, md: 4 },
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <Box sx={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="overline" sx={{ color: 'var(--brand-bestai)', letterSpacing: '0.24em' }}>
            Cerebro Solutions Hub
          </Typography>
          <Typography variant="h3" sx={{ color: 'var(--text)', fontWeight: 600 }}>
            Activate NVIDIA-grade intelligence for your data ecosystems.
          </Typography>
          <Typography variant="body1" sx={{ color: 'var(--text-dim)' }}>
            Choose a workflow to launch. Each solution blends Cerebro’s AI reasoning with the precision of
            enterprise data pipelines — inspired by NVIDIA design language and tuned for BestAI experiences.
          </Typography>
        </Box>

        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            component={RouterLink}
            to="/solutions/db"
            variant="contained"
            color="primary"
            size="large"
          >
            Jump to Database Assistant
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            size="large"
            component={RouterLink}
            to="/docs"
            disabled
          >
            Docs (soon)
          </Button>
        </Stack>
      </Box>

      <SolutionsGrid items={availableSolutions} />
    </Box>
  );
};

export default SolutionsHub;
