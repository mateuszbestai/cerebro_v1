import BoltIcon from '@mui/icons-material/Bolt';
import { Button, Chip, Stack, Typography } from '@mui/material';
import React from 'react';

interface UseForAIButtonProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  loading?: boolean;
}

const UseForAIButton: React.FC<UseForAIButtonProps> = ({ enabled, onToggle, loading }) => {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
      <Button
        variant={enabled ? 'contained' : 'outlined'}
        color="secondary"
        startIcon={<BoltIcon />}
        onClick={() => onToggle(!enabled)}
        disabled={loading}
      >
        {enabled ? 'GDM enabled for AI queries' : 'Use Global Model for AI Queries'}
      </Button>
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          {enabled ? 'Natural language queries include this model as context.' : 'Enable to ground NL queries in this model.'}
        </Typography>
        {enabled && <Chip label="Enabled" color="success" size="small" />}
      </Stack>
    </Stack>
  );
};

export default UseForAIButton;
