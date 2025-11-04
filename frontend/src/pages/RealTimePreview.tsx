import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Tooltip,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

const featureBullets = [
  'Live connectors',
  'Entity resolution',
  'RAG pipelines',
  'Latency budget < 2s (target)',
];

const RealTimePreview: React.FC = () => {
  return (
    <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
          alignItems: 'center',
          background:
            'linear-gradient(150deg, rgba(0,180,216,0.24) 0%, rgba(118,185,0,0.12) 45%, rgba(11,15,13,0.92) 100%)',
          borderRadius: 'var(--radius)',
          border: '1px solid rgba(44, 53, 47, 0.8)',
          boxShadow: 'var(--shadow-1)',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: { xs: 3, md: 5 } }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Chip
              label="COMING SOON"
              variant="outlined"
              sx={{
                color: 'var(--text-muted)',
                borderColor: 'rgba(169, 183, 169, 0.45)',
                backgroundColor: 'rgba(17,22,20,0.35)',
                letterSpacing: '0.18em',
              }}
            />
            <Chip label="Preview" sx={{ color: 'var(--brand-bestai)' }} variant="outlined" />
          </Stack>

          <Typography variant="h3" sx={{ mb: 2, color: 'var(--text)' }}>
            Real-Time Data Analysis
          </Typography>
          <Typography variant="body1" sx={{ color: 'var(--text-dim)', maxWidth: 520 }}>
            We are building a streaming-first intelligence layer that fuses RAG retrieval with GPU-accelerated
            analytics. Plug in live sources, orchestrate entity graphs, and keep responses under two seconds.
          </Typography>
        </Box>

        <Box
          sx={{
            p: { xs: 3, md: 5 },
            backgroundColor: 'rgba(11,15,13,0.65)',
            backdropFilter: 'blur(12px)',
            height: '100%',
          }}
        >
          <Typography variant="subtitle2" sx={{ color: 'var(--text-muted)', mb: 2, letterSpacing: '0.12em' }}>
            PROJECT TARGETS
          </Typography>
          <List dense>
            {featureBullets.map((bullet) => (
              <ListItem key={bullet} sx={{ color: 'var(--text-dim)' }}>
                <ListItemIcon sx={{ minWidth: 32, color: 'var(--brand-bestai)' }}>
                  <FiberManualRecordIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primaryTypographyProps={{ variant: 'body2', color: 'var(--text)' }}
                  primary={bullet}
                />
              </ListItem>
            ))}
          </List>

          <Tooltip title="We’ll notify you when this goes live" arrow placement="top">
            <span>
              <Button
                variant="contained"
                disabled
                color="secondary"
                sx={{ mt: 3 }}
              >
                Coming soon
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>
        Want to shape this release? Reach out via your Cerebro success partner or email{' '}
        <Box component="span" sx={{ color: 'var(--brand-bestai)' }}>
          hello@bestai.pl
        </Box>
        .
      </Typography>
    </Box>
  );
};

export default RealTimePreview;
