import { Box, Stack, Typography } from '@mui/material';
import React from 'react';
import { GDMTimelineItem } from '../../services/gdmApi';

interface StoryTimelineProps {
  items?: GDMTimelineItem[];
}

const statusColor: Record<string, string> = {
  done: '#76B900',
  in_progress: '#FFC857',
  failed: '#FF6B6B',
  pending: 'rgba(255,255,255,0.4)',
};

const StoryTimeline: React.FC<StoryTimelineProps> = ({ items }) => {
  if (!items || items.length === 0) {
    return <Typography variant="body2">Timeline unavailable.</Typography>;
  }

  return (
    <Stack spacing={3} sx={{ position: 'relative' }}>
      {items.map((item, index) => (
        <Stack key={item.id} direction="row" spacing={2} alignItems="flex-start">
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: statusColor[item.status] || 'var(--text-muted)',
                border: '2px solid var(--surface-2)',
              }}
            />
            {index !== items.length - 1 && (
              <Box sx={{ width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', mt: 1 }} />
            )}
          </Box>
          <Box>
            <Typography variant="subtitle2">{item.label}</Typography>
            <Typography variant="body2" color="text.secondary">
              {item.description}
            </Typography>
            {item.timestamp && (
              <Typography variant="caption" color="text.disabled">
                {new Date(item.timestamp).toLocaleString()}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
};

export default StoryTimeline;
