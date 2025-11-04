import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Button,
  Tooltip,
  Stack,
  Paper,
} from '@mui/material';
import type { SolutionConfig, SolutionState } from '../../config/solutions';

interface SolutionCardProps extends SolutionConfig {
  href: string;
}

const badgePalette: Record<SolutionState, { border: string; color: string; background: string }> = {
  available: {
    border: 'rgba(118, 185, 0, 0.35)',
    color: 'var(--text)',
    background: 'rgba(118, 185, 0, 0.12)',
  },
  'coming-soon': {
    border: 'rgba(169, 183, 169, 0.4)',
    color: 'var(--text-muted)',
    background: 'rgba(26, 31, 30, 0.6)',
  },
  disabled: {
    border: 'rgba(169, 183, 169, 0.25)',
    color: 'var(--text-muted)',
    background: 'rgba(17, 22, 20, 0.4)',
  },
};

const SolutionCard: React.FC<SolutionCardProps> = ({
  id,
  title,
  subtitle,
  state,
  badge,
  image,
  tags,
  href,
}) => {
  const isDisabled = state === 'disabled';
  const isAvailable = state === 'available';
  const isComingSoon = state === 'coming-soon';
  const cardMediaBackground =
    image && image.trim().startsWith('linear-gradient')
      ? { backgroundImage: image }
      : image
      ? {
          backgroundImage: `linear-gradient(160deg, rgba(11, 15, 13, 0) 20%, rgba(11, 15, 13, 0.65) 100%), url(${image})`,
        }
      : {
          backgroundImage:
            'linear-gradient(135deg, rgba(118, 185, 0, 0.35) 0%, rgba(0, 180, 216, 0.12) 50%, rgba(11, 15, 13, 0.85) 100%)',
        };

  const badgeStyles = badgePalette[state];

  const cardContent = (
    <Paper
      elevation={0}
      component={isDisabled ? 'div' : RouterLink}
      to={isDisabled ? undefined : href}
      role="button"
      aria-disabled={isDisabled}
      tabIndex={0}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 360,
        textDecoration: 'none',
        color: 'inherit',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        backgroundColor: 'var(--surface)',
        backdropFilter: 'blur(var(--blur))',
        transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        '&:hover': !isDisabled
          ? {
              transform: 'translateY(-4px) scale(1.01)',
              boxShadow: 'var(--shadow-2)',
            }
          : {},
        '&:focus-visible': {
          outline: '2px solid var(--ring)',
          outlineOffset: '4px',
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          height: 180,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          ...cardMediaBackground,
        }}
      >
        <Box
          component="span"
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(11, 15, 13, 0.1) 0%, rgba(11, 15, 13, 0.75) 90%)',
          }}
        />

        {badge && (
          <Box
            component="span"
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.18em',
              padding: '6px 12px',
              borderRadius: '999px',
              border: `1px solid ${badgeStyles.border}`,
              backgroundColor: badgeStyles.background,
              color: badgeStyles.color,
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </Box>
        )}
      </Box>

      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h5" component="h3" sx={{ color: 'var(--text)', lineHeight: 1.2 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: 'var(--text-dim)' }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {tags && tags.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {tags.map((tag) => (
              <Chip
                key={`${id}-${tag}`}
                size="small"
                label={tag.toUpperCase()}
                variant="outlined"
                sx={{
                  color: 'var(--text-muted)',
                  borderColor: 'rgba(169, 183, 169, 0.4)',
                  backgroundColor: 'rgba(26, 31, 30, 0.4)',
                }}
              />
            ))}
          </Stack>
        )}

        <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            {state === 'available' && 'AVAILABLE NOW'}
            {state === 'coming-soon' && 'SNEAK PEEK'}
            {state === 'disabled' && 'UNAVAILABLE'}
          </Typography>

          {isAvailable && (
            <Button variant="contained" color="primary" size="medium">
              Open
            </Button>
          )}

          {isComingSoon && (
            <Tooltip title="Coming soon" placement="top" arrow>
              <span>
                <Button variant="outlined" size="medium" disabled sx={{ color: 'var(--text-dim)' }}>
                  Preview
                </Button>
              </span>
            </Tooltip>
          )}

          {state === 'disabled' && (
            <Tooltip title="Currently unavailable" placement="top" arrow>
              <span>
                <Button variant="outlined" size="medium" disabled sx={{ color: 'var(--text-muted)' }}>
                  Disabled
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Paper>
  );

  return cardContent;
};

export default SolutionCard;
