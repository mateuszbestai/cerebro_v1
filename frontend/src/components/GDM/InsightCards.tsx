import {
  Box,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Typography,
  Chip,
} from '@mui/material';
import React from 'react';
import { GDMInsight } from '../../services/gdmApi';

interface InsightCardsProps {
  insights?: GDMInsight[];
  loading?: boolean;
  onSelect?: (nodes: string[]) => void;
}

const severityColor: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'success'> = {
  info: 'secondary',
  warning: 'warning',
  critical: 'error',
};

const InsightCards: React.FC<InsightCardsProps> = ({ insights = [], loading, onSelect }) => {
  if (loading) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <Grid item xs={12} md={3} key={idx}>
            <Skeleton variant="rounded" height={110} />
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={2}>
      {insights.map((insight) => (
        <Grid item xs={12} md={4} key={insight.id}>
          <Card
            variant="outlined"
            sx={{
              height: '100%',
              cursor: insight.affected_nodes.length ? 'pointer' : 'default',
              borderColor: 'rgba(118,185,0,0.2)',
            }}
            onClick={() => insight.affected_nodes.length && onSelect?.(insight.affected_nodes)}
          >
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="subtitle2" sx={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                    {insight.title}
                  </Typography>
                  <Typography variant="h6">{insight.value}</Typography>
                </Box>
                <Chip
                  size="small"
                  label={insight.severity.toUpperCase()}
                  color={severityColor[insight.severity] ?? 'default'}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {insight.description}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default InsightCards;
