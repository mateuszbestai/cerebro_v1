/**
 * Confusion Matrix Chart
 *
 * Heatmap visualization of classification model performance.
 */

import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';

interface ConfusionMatrixChartProps {
  matrix: number[][];
  labels: string[];
}

const ConfusionMatrixChart: React.FC<ConfusionMatrixChartProps> = ({ matrix, labels }) => {
  if (!matrix || matrix.length === 0 || !labels || labels.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No confusion matrix data available.
      </Typography>
    );
  }

  // Calculate max value for color scaling
  const maxValue = Math.max(...matrix.flat());
  const total = matrix.flat().reduce((a, b) => a + b, 0);

  // Calculate diagonal (correct predictions)
  const correctPredictions = matrix.reduce((sum, row, i) => sum + row[i], 0);
  const accuracy = ((correctPredictions / total) * 100).toFixed(1);

  const getCellColor = (value: number, isDiagonal: boolean): string => {
    const intensity = value / maxValue;
    if (isDiagonal) {
      // Green for correct predictions
      const green = Math.round(100 + 155 * intensity);
      return `rgb(200, ${green}, 200)`;
    } else {
      // Red for incorrect predictions
      const red = Math.round(255 * intensity);
      return `rgb(${red}, 200, 200)`;
    }
  };

  const getTextColor = (value: number): string => {
    return value / maxValue > 0.5 ? '#000' : '#666';
  };

  const cellSize = Math.min(80, 400 / labels.length);

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Overall Accuracy: <strong>{accuracy}%</strong> ({correctPredictions.toLocaleString()} of {total.toLocaleString()} correct)
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Column headers */}
        <Box sx={{ display: 'flex', ml: `${cellSize + 10}px` }}>
          <Typography
            variant="caption"
            sx={{
              width: labels.length * cellSize,
              textAlign: 'center',
              mb: 0.5,
              fontWeight: 'bold',
            }}
          >
            Predicted
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', ml: `${cellSize + 10}px` }}>
          {labels.map((label) => (
            <Tooltip key={label} title={label}>
              <Typography
                variant="caption"
                sx={{
                  width: cellSize,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Typography>
            </Tooltip>
          ))}
        </Box>

        {/* Matrix with row headers */}
        <Box sx={{ display: 'flex' }}>
          {/* Row header label */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              width: 20,
              mr: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                transform: 'rotate(-90deg)',
                transformOrigin: 'center',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              Actual
            </Typography>
          </Box>

          {/* Row labels */}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {labels.map((label) => (
              <Tooltip key={label} title={label}>
                <Typography
                  variant="caption"
                  sx={{
                    width: cellSize - 10,
                    height: cellSize,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    pr: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Typography>
              </Tooltip>
            ))}
          </Box>

          {/* Matrix cells */}
          <Box>
            {matrix.map((row, i) => (
              <Box key={i} sx={{ display: 'flex' }}>
                {row.map((value, j) => {
                  const isDiagonal = i === j;
                  const bgColor = getCellColor(value, isDiagonal);
                  const percentage = ((value / total) * 100).toFixed(1);

                  return (
                    <Tooltip
                      key={j}
                      title={`Actual: ${labels[i]}, Predicted: ${labels[j]}, Count: ${value} (${percentage}%)`}
                    >
                      <Box
                        sx={{
                          width: cellSize,
                          height: cellSize,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: bgColor,
                          border: isDiagonal ? '2px solid #4caf50' : '1px solid #e0e0e0',
                          cursor: 'pointer',
                          '&:hover': {
                            opacity: 0.8,
                          },
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            color: getTextColor(value),
                            fontWeight: isDiagonal ? 'bold' : 'normal',
                            fontSize: cellSize < 50 ? '0.7rem' : '0.875rem',
                          }}
                        >
                          {value}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                bgcolor: 'rgb(200, 255, 200)',
                border: '2px solid #4caf50',
                mr: 0.5,
              }}
            />
            <Typography variant="caption">Correct (diagonal)</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                bgcolor: 'rgb(255, 200, 200)',
                border: '1px solid #e0e0e0',
                mr: 0.5,
              }}
            />
            <Typography variant="caption">Incorrect</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ConfusionMatrixChart;
