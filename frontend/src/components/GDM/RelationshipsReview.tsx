import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import React, { useMemo, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { materialDark, materialLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { GDMRelationshipReview } from '../../services/gdmApi';
import { useTheme } from '@mui/material/styles';

interface RelationshipsReviewProps {
  review?: GDMRelationshipReview;
  loading?: boolean;
  onConfirm: (relationshipIds: string[]) => void;
  confirming?: boolean;
}

const RelationshipsReview: React.FC<RelationshipsReviewProps> = ({
  review,
  loading,
  onConfirm,
  confirming,
}) => {
  const theme = useTheme();
  const [tab, setTab] = useState<'candidates' | 'confirmed'>('candidates');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = tab === 'candidates' ? review?.candidates ?? [] : review?.confirmed ?? [];
  const hasSelection = Object.values(selected).some(Boolean);

  const toggleSelectAll = (checked: boolean) => {
    if (!review?.candidates) return;
    const next: Record<string, boolean> = {};
    review.candidates.forEach((rel) => {
      next[rel.id] = checked;
    });
    setSelected(next);
  };

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([id]) => id), [selected]);

  if (loading) {
    return <Skeleton variant="rounded" height={240} />;
  }

  if (!review) {
    return <Alert severity="info">No relationship insight available.</Alert>;
  }

  const handleConfirm = () => {
    if (selectedIds.length === 0) return;
    onConfirm(selectedIds);
    setSelected({});
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        backgroundColor:
          theme.palette.mode === 'dark' ? 'rgba(17,22,20,0.9)' : theme.palette.background.paper,
        borderColor: theme.palette.divider,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
        <Box>
          <Typography variant="h6">Relationships Review</Typography>
          <Typography variant="body2" color="text.secondary">
            Confirm candidate joins to promote them into the trusted catalog.
          </Typography>
        </Box>
        {tab === 'candidates' && (
          <Button variant="contained" disabled={!hasSelection || confirming} onClick={handleConfirm}>
            Confirm selected ({selectedIds.length})
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label={`Candidates (${review.candidates.length})`} value="candidates" />
        <Tab label={`Confirmed (${review.confirmed.length})`} value="confirmed" />
      </Tabs>

      <Table
        size="small"
        sx={{
          mt: 2,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          overflow: 'hidden',
          '& th': {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.03)',
            color: theme.palette.text.secondary,
            fontWeight: 700,
            borderColor: theme.palette.divider,
          },
          '& td': {
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
          },
          '& tbody tr:nth-of-type(odd)': {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(0,0,0,0.015)',
          },
        }}
      >
        <TableHead>
          <TableRow>
            {tab === 'candidates' && (
              <TableCell padding="checkbox">
                <Checkbox
                  checked={review.candidates.length > 0 && review.candidates.every((rel) => selected[rel.id])}
                  indeterminate={
                    review.candidates.some((rel) => selected[rel.id]) &&
                    !review.candidates.every((rel) => selected[rel.id])
                  }
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
              </TableCell>
            )}
            <TableCell>Relationship</TableCell>
            <TableCell width="160">Confidence</TableCell>
            <TableCell width="160">Evidence</TableCell>
            <TableCell width="140">Preview</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((rel) => (
            <React.Fragment key={rel.id}>
              <TableRow hover>
                {tab === 'candidates' && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={Boolean(selected[rel.id])}
                      onChange={(event) =>
                        setSelected((prev) => ({
                          ...prev,
                          [rel.id]: event.target.checked,
                        }))
                      }
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {rel.from_table}.{rel.from_column} →
                    {rel.to_table}.{rel.to_column || '??'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Strategy: {rel.strategy || 'n/a'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">{Math.round(rel.confidence * 100)}%</Typography>
                    <LinearProgress variant="determinate" value={Math.round(rel.confidence * 100)} />
                  </Stack>
                </TableCell>
                <TableCell>
                  <Tooltip title={rel.evidence || ''}>
                    <Chip
                      label="Evidence"
                      variant="outlined"
                      sx={{
                        borderColor:
                          theme.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.2)'
                            : theme.palette.primary.light,
                        backgroundColor:
                          theme.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(118,185,0,0.08)',
                      }}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <IconButton size="small" onClick={() => setExpanded((prev) => (prev === rel.id ? null : rel.id))}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => navigator.clipboard.writeText(rel.preview_sql || '')}
                      disabled={!rel.preview_sql}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={tab === 'candidates' ? 5 : 4} sx={{ p: 0 }}>
                  <Collapse in={expanded === rel.id}>
                    <SyntaxHighlighter
                      language="sql"
                      style={theme.palette.mode === 'dark' ? materialDark : materialLight}
                      customStyle={{
                        margin: 0,
                        borderRadius: 0,
                        background:
                          theme.palette.mode === 'dark'
                            ? 'rgba(0,0,0,0.7)'
                            : 'rgba(245,247,245,0.95)',
                      }}
                    >
                      {rel.preview_sql || '-- preview unavailable'}
                    </SyntaxHighlighter>
                  </Collapse>
                </TableCell>
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      {rows.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No {tab} relationships to display.
        </Alert>
      )}
    </Paper>
  );
};

export default RelationshipsReview;
