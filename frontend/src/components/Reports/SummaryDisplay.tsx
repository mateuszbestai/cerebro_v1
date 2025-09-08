import React from 'react';
import {
  Paper,
  Typography,
  Box,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  TrendingUp as TrendIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

interface SummaryDisplayProps {
  summary: {
    executive?: string;
    insights?: string[];
    recommendations?: string[];
    warnings?: string[];
  };
}

const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ summary }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'insight':
        return <TrendIcon color="primary" />;
      case 'recommendation':
        return <CheckIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      default:
        return <InfoIcon />;
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      {summary.executive && (
        <>
          <Typography variant="h6" gutterBottom>
            Executive Summary
          </Typography>
          <Typography variant="body1" paragraph>
            {summary.executive}
          </Typography>
          <Divider sx={{ my: 2 }} />
        </>
      )}

      {summary.insights && summary.insights.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Key Insights
          </Typography>
          <List>
            {summary.insights.map((insight, index) => (
              <ListItem key={index}>
                <ListItemIcon>{getIcon('insight')}</ListItemIcon>
                <ListItemText primary={insight} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {summary.recommendations && summary.recommendations.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Recommendations
          </Typography>
          <List>
            {summary.recommendations.map((recommendation, index) => (
              <ListItem key={index}>
                <ListItemIcon>{getIcon('recommendation')}</ListItemIcon>
                <ListItemText primary={recommendation} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {summary.warnings && summary.warnings.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Warnings
          </Typography>
          <List>
            {summary.warnings.map((warning, index) => (
              <ListItem key={index}>
                <ListItemIcon>{getIcon('warning')}</ListItemIcon>
                <ListItemText primary={warning} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Paper>
  );
};

export default SummaryDisplay;