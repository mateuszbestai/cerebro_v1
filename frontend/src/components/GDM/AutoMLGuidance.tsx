import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import InsightsIcon from '@mui/icons-material/Insights';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import React from 'react';
import {
  AutomlGuidance,
  AutomlTargetRecommendation,
  FeatureAvailabilityHint,
  FeatureSuggestion,
  KPISignal,
} from '../../services/gdmApi';

interface Props {
  guidance?: AutomlGuidance;
  onApplyTarget?: (rec: AutomlTargetRecommendation) => void;
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        minHeight: 280,
        borderRadius: 3,
        borderColor: isDark ? 'rgba(118,185,0,0.3)' : 'rgba(12,100,64,0.25)',
        background: isDark
          ? 'linear-gradient(145deg, rgba(17,22,20,0.95), rgba(12,18,15,0.9)), radial-gradient(circle at 12% 18%, rgba(118,185,0,0.15), transparent 42%)'
          : 'linear-gradient(145deg, rgba(239,248,242,0.95), rgba(228,243,234,0.9)), radial-gradient(circle at 12% 18%, rgba(0,163,136,0.12), transparent 42%)',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        {icon}
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Stack>
      <Divider sx={{ mb: 1.5 }} />
      {children}
    </Paper>
  );
};

const renderFeatureAvailability = (items: FeatureAvailabilityHint[], label: string) => (
  <Stack spacing={1}>
    <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
      {label}
    </Typography>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {items.slice(0, 8).map((item, index) => (
        <Chip
          key={`${label}-${item.table || 'unknown'}-${item.column}-${index}`}
          label={`${item.table ? `${item.table}.` : ''}${item.column} · ${item.reason}`}
          size="small"
          color="secondary"
          variant="outlined"
        />
      ))}
      {!items.length && <Typography variant="body2" color="text.secondary">No timing hints detected yet.</Typography>}
    </Stack>
  </Stack>
);

const renderKPIs = (items: KPISignal[]) => (
  <Stack spacing={1}>
    <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
      KPI & price signals
    </Typography>
    <Stack spacing={1}>
      {items.slice(0, 6).map((item) => (
        <Box key={`${item.table}-${item.column}`} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size="small" label={item.semantic_type || 'metric'} color="secondary" variant="outlined" />
          <Typography variant="body2">
            {item.table}.{item.column}
          </Typography>
          {item.definition && (
            <Typography variant="caption" color="text.secondary">
              {item.definition}
            </Typography>
          )}
        </Box>
      ))}
      {!items.length && <Typography variant="body2" color="text.secondary">No KPI or pricing columns found.</Typography>}
    </Stack>
  </Stack>
);

const FeatureBundleItem: React.FC<{ item: FeatureSuggestion }> = ({ item }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: isDark ? '1px dashed rgba(255,255,255,0.15)' : '1px dashed rgba(0,0,0,0.15)',
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.table}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {item.reason}
        {item.feature_time ? ` (${item.feature_time.column})` : ''}
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        {item.features.map((feature) => (
          <Chip key={`${item.table}-${feature}`} label={feature} size="small" />
        ))}
      </Stack>
    </Box>
  );
};

const renderFeatureBundles = (items: FeatureSuggestion[]) => (
  <Stack spacing={1}>
    <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
      Suggested feature bundles
    </Typography>
    <Stack spacing={1.5}>
      {items.slice(0, 4).map((item) => (
        <FeatureBundleItem key={`${item.table}-${item.features.join('-')}`} item={item} />
      ))}
      {!items.length && <Typography variant="body2" color="text.secondary">Feature candidates will appear here when detected.</Typography>}
    </Stack>
  </Stack>
);

const AutoMLGuidance: React.FC<Props> = ({ guidance, onApplyTarget }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!guidance) return null;

  const targets = guidance.recommended_targets || [];
  const timing = guidance.feature_availability || [];
  const processes = guidance.business_processes || [];
  const kpis = guidance.kpi_columns || [];
  const bundles = guidance.feature_suggestions || [];

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <SectionCard title="Best targets for AutoML" icon={<AutoAwesomeIcon color="primary" fontSize="small" />}>
          <List dense disablePadding sx={{ maxHeight: 350, overflowY: 'auto' }}>
            {targets.slice(0, 5).map((rec) => (
              <ListItem
                key={`${rec.table}-${rec.column}-${rec.task}`}
                secondaryAction={
                  onApplyTarget && (
                    <Tooltip title="Apply to playbook form">
                      <span>
                        <Button size="small" onClick={() => onApplyTarget(rec)}>
                          Use
                        </Button>
                      </span>
                    </Tooltip>
                  )
                }
                sx={{
                  borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                  flexWrap: 'wrap',
                }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {rec.table}.{rec.column}
                      </Typography>
                      <Chip size="small" label={rec.task} color="secondary" />
                      {rec.semantic_type && (
                        <Chip size="small" label={rec.semantic_type} variant="outlined" />
                      )}
                    </Stack>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word', display: 'block', mb: 0.5 }}>
                        {rec.reason}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        {rec.business_process && (
                          <Chip
                            size="small"
                            icon={<BusinessCenterIcon fontSize="inherit" />}
                            label={rec.business_process}
                            variant="outlined"
                          />
                        )}
                        {rec.feature_time && (
                          <Chip
                            size="small"
                            icon={<TimelineIcon fontSize="inherit" />}
                            label={rec.feature_time.column}
                            variant="outlined"
                          />
                        )}
                        {rec.row_count && (
                          <Chip size="small" label={`${rec.row_count.toLocaleString()} rows`} />
                        )}
                      </Box>
                    </Box>
                  }
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            ))}
            {!targets.length && (
              <ListItem>
                <ListItemText
                  primary={
                    <Typography variant="body2" color="text.secondary">
                      No target recommendations yet — add more data or rerun profiling.
                    </Typography>
                  }
                />
              </ListItem>
            )}
          </List>
        </SectionCard>
      </Grid>
      <Grid item xs={12} md={6}>
        <SectionCard
          title="Feature timing & processes"
          icon={<TimelineIcon color="secondary" fontSize="small" />}
        >
          <Stack spacing={2} sx={{ maxHeight: 350, overflowY: 'auto' }}>
            {renderFeatureAvailability(timing, 'Feature availability')}
            <Divider />
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
                Business process mapping
              </Typography>
              <Stack spacing={1}>
                {processes.slice(0, 6).map((item) => (
                  <Stack key={`${item.table}-${item.process}`} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={item.process} color="primary" variant="outlined" />
                    <Typography variant="body2">{item.table}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                      {item.reason}
                    </Typography>
                  </Stack>
                ))}
                {!processes.length && <Typography variant="body2" color="text.secondary">No process mapping inferred.</Typography>}
              </Stack>
            </Stack>
          </Stack>
        </SectionCard>
      </Grid>
      <Grid item xs={12}>
        <SectionCard title="KPI, price, and feature cues" icon={<InsightsIcon color="action" fontSize="small" />}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={5}>
              {renderKPIs(kpis)}
            </Grid>
            <Grid item xs={12} md={7}>
              {renderFeatureBundles(bundles)}
            </Grid>
          </Grid>
        </SectionCard>
      </Grid>
    </Grid>
  );
};

export default AutoMLGuidance;
