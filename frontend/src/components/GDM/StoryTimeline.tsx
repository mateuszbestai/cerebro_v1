import { Box, Stack, Typography, useTheme } from '@mui/material';
import React from 'react';
import { GDMTimelineItem } from '../../services/gdmApi';

interface StoryTimelineProps {
  items?: GDMTimelineItem[];
}

const StoryTimeline: React.FC<StoryTimelineProps> = ({ items }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const statusColor: Record<string, string> = {
    done: '#76B900',
    in_progress: '#FFC857',
    failed: '#FF6B6B',
    pending: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)',
  };

  const lineColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const borderColor = isDark ? theme.palette.background.paper : theme.palette.background.default;

  if (!items || items.length === 0) {
    return <Typography variant="body2" color="text.secondary">Timeline unavailable.</Typography>;
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
                backgroundColor: statusColor[item.status] || theme.palette.text.secondary,
                border: `2px solid ${borderColor}`,
              }}
            />
            {index !== items.length - 1 && (
              <Box sx={{ width: 2, flex: 1, backgroundColor: lineColor, mt: 1 }} />
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
