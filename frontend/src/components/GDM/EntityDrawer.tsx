import { Close, InsertDriveFile } from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import React from 'react';
import { GDMGraphNode } from '../../services/gdmApi';

interface EntityDrawerProps {
  entity: GDMGraphNode | null;
  onClose: () => void;
  onPreviewJson?: (entityId: string) => void;
}

const EntityDrawer: React.FC<EntityDrawerProps> = ({ entity, onClose, onPreviewJson }) => {
  const handlePreview = () => {
    if (entity && onPreviewJson) {
      onPreviewJson(entity.id);
    }
  };

  return (
    <Drawer anchor="right" open={Boolean(entity)} onClose={onClose} PaperProps={{ sx: { width: 360 } }}>
      {entity && (
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="overline" sx={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
                ENTITY
              </Typography>
              <Typography variant="h5">{entity.label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {entity.schema}.{entity.name}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <Close />
            </IconButton>
          </Box>

          <Stack direction="row" spacing={1}>
            <Chip label={entity.type.toUpperCase()} color={entity.type === 'fact' ? 'secondary' : 'default'} />
            <Chip label={`${entity.column_count ?? 0} columns`} variant="outlined" />
            {typeof entity.row_count === 'number' && (
              <Chip label={`${entity.row_count.toLocaleString()} rows`} variant="outlined" />
            )}
          </Stack>

          <Button
            variant="outlined"
            startIcon={<InsertDriveFile />}
            onClick={handlePreview}
            fullWidth
            sx={{ borderStyle: 'dashed' }}
          >
            Preview in JSON
          </Button>

          <Divider />

          <Typography variant="subtitle2">Columns</Typography>
          <List dense sx={{ flex: 1, overflowY: 'auto' }}>
            {entity.columns.map((column) => (
              <ListItem
                key={column.name}
                secondaryAction={column.is_primary_key ? <Chip size="small" label="PK" color="success" /> : null}
              >
                <ListItemText
                  primary={column.name}
                  secondary={`${column.type || 'unknown'}${column.nullable ? ' · nullable' : ''}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Drawer>
  );
};

export default EntityDrawer;
