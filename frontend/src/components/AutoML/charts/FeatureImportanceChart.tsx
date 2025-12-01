/**
 * Feature Importance Chart
 *
 * Horizontal bar chart showing feature importance scores.
 */

import React, { useMemo } from 'react';
import { Box, Typography, LinearProgress, Tooltip } from '@mui/material';

interface FeatureImportanceChartProps {
  featureImportance: Record<string, number>;
  maxFeatures?: number;
}

const FeatureImportanceChart: React.FC<FeatureImportanceChartProps> = ({
  featureImportance,
  maxFeatures = 15,
}) => {
  const sortedFeatures = useMemo(() => {
    const entries = Object.entries(featureImportance);
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, maxFeatures);
  }, [featureImportance, maxFeatures]);

  if (sortedFeatures.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No feature importance data available.
      </Typography>
    );
  }

  const maxValue = Math.max(...sortedFeatures.map(([, v]) => v));
  const totalImportance = sortedFeatures.reduce((sum, [, v]) => sum + v, 0);

  return (
    <Box sx={{ width: '100%' }}>
      {sortedFeatures.map(([feature, value], index) => {
        const percentage = (value / maxValue) * 100;
        const relativePercentage = ((value / totalImportance) * 100).toFixed(1);

        return (
          <Box key={feature} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Tooltip title={feature} placement="top-start">
                <Typography
                  variant="body2"
                  sx={{
                    maxWidth: '60%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {index + 1}. {feature}
                </Typography>
              </Tooltip>
              <Typography variant="body2" color="text.secondary">
                {relativePercentage}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={percentage}
              sx={{
                height: 12,
                borderRadius: 1,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  bgcolor: getBarColor(index),
                  borderRadius: 1,
                },
              }}
            />
          </Box>
        );
      })}

      {Object.keys(featureImportance).length > maxFeatures && (
        <Typography variant="caption" color="text.secondary">
          Showing top {maxFeatures} of {Object.keys(featureImportance).length} features
        </Typography>
      )}
    </Box>
  );
};

const getBarColor = (index: number): string => {
  const colors = [
    '#1976d2', // Primary blue
    '#2196f3',
    '#42a5f5',
    '#64b5f6',
    '#90caf9',
    '#bbdefb',
    '#64b5f6',
    '#42a5f5',
    '#2196f3',
    '#1976d2',
  ];
  return colors[index % colors.length];
};

export default FeatureImportanceChart;
