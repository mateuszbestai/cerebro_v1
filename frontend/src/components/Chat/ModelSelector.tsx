import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Tooltip,
  Typography,
  CircularProgress,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useModelOptions } from '../../contexts/ModelContext';

const ModelSelector: React.FC = () => {
  const { models, selectedModel, selectModel, isLoading, error } = useModelOptions();

  const handleChange = (event: SelectChangeEvent<string>) => {
    selectModel(event.target.value);
  };

  if (error) {
    return (
      <Tooltip title={error}>
        <Box display="flex" alignItems="center" gap={1}>
          <InfoOutlinedIcon color="error" fontSize="small" />
          <Typography variant="caption" color="error">
            Model unavailable
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  if (isLoading) {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        <CircularProgress size={16} />
        <Typography variant="caption" color="text.secondary">
          Loading models...
        </Typography>
      </Box>
    );
  }

  if (!models.length) return null;

  return (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <InputLabel id="model-selector-label">Model</InputLabel>
      <Select
        labelId="model-selector-label"
        label="Model"
        value={selectedModel?.id || ''}
        onChange={handleChange}
      >
        {models.map((model) => (
          <MenuItem key={model.id} value={model.id}>
            <Box display="flex" flexDirection="column">
              <Typography variant="body2">{model.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {model.mode === 'chat' ? 'Chat Completions' : 'Responses'}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ModelSelector;
