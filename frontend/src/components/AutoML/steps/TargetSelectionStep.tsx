/**
 * Target Selection Step
 *
 * Allows users to select which column they want to predict.
 * Shows GDM recommendations if available.
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Alert,
  Collapse,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import StarIcon from '@mui/icons-material/Star';
import WarningIcon from '@mui/icons-material/Warning';

import {
  TaskType,
  ColumnInfo,
  GDMAutoMLGuidance,
} from '../../../types/automl';

interface TargetSelectionStepProps {
  columns: ColumnInfo[];
  previewData: Record<string, any>[];
  gdmGuidance?: GDMAutoMLGuidance;
  selectedTable?: string | null;
  initialTarget?: string | null;
  initialTask?: TaskType;
  initialExcluded?: string[];
  onSelect: (column: string, task: TaskType, excludedColumns: string[]) => void;
  onBack: () => void;
}

const TargetSelectionStep: React.FC<TargetSelectionStepProps> = ({
  columns,
  gdmGuidance,
  selectedTable,
  initialTarget,
  initialTask,
  initialExcluded = [],
  onSelect,
  onBack,
}) => {
  const [targetColumn, setTargetColumn] = useState<string | null>(initialTarget || null);
  const [task, setTask] = useState<TaskType>(initialTask || 'classification');
  const [excludedColumns, setExcludedColumns] = useState<string[]>(initialExcluded);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get recommendations for the selected table
  const recommendations = useMemo(() => {
    if (!gdmGuidance?.recommended_targets || !selectedTable) return [];
    return gdmGuidance.recommended_targets.filter(
      (rec) => rec.table === selectedTable || rec.table.endsWith(`.${selectedTable}`)
    );
  }, [gdmGuidance, selectedTable]);

  // Get warnings for target columns
  const getWarningsForColumn = (columnName: string) => {
    if (!gdmGuidance?.target_warnings) return null;
    return gdmGuidance.target_warnings.find(
      (w) => w.column === columnName && (w.table === selectedTable || w.table.endsWith(`.${selectedTable}`))
    );
  };

  const handleTargetSelect = (column: string, recommendedTask?: TaskType) => {
    setTargetColumn(column);
    if (recommendedTask) {
      setTask(recommendedTask);
    }
    // Auto-exclude ID columns and timestamps
    const autoExclude = columns
      .filter((c) => {
        const name = c.name.toLowerCase();
        return (
          name.endsWith('_id') ||
          name === 'id' ||
          name.includes('timestamp') ||
          name.includes('created_at') ||
          name.includes('updated_at')
        );
      })
      .map((c) => c.name)
      .filter((c) => c !== column);
    setExcludedColumns(autoExclude);
  };

  const handleExcludedToggle = (columnName: string) => {
    setExcludedColumns((prev) =>
      prev.includes(columnName) ? prev.filter((c) => c !== columnName) : [...prev, columnName]
    );
  };

  const handleContinue = () => {
    if (targetColumn) {
      onSelect(targetColumn, task, excludedColumns);
    }
  };

  const isColumnExcluded = (col: string) => excludedColumns.includes(col) || col === targetColumn;
  const featureColumns = columns.filter((c) => !isColumnExcluded(c.name));

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        What Do You Want to Predict?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select the column that contains the outcome you want to predict. Our AI will learn patterns from other columns to make predictions.
      </Typography>

      {/* GDM Recommendations */}
      {recommendations.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <StarIcon color="primary" sx={{ mr: 1 }} />
            AI Recommendations
          </Typography>
          <Grid container spacing={2}>
            {recommendations.slice(0, 3).map((rec) => {
              const warnings = getWarningsForColumn(rec.column);
              return (
                <Grid item xs={12} md={4} key={`${rec.table}.${rec.column}`}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderColor: targetColumn === rec.column ? 'primary.main' : 'divider',
                      borderWidth: targetColumn === rec.column ? 2 : 1,
                    }}
                  >
                    <CardActionArea onClick={() => handleTargetSelect(rec.column, rec.task)}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ flex: 1 }}>
                            {rec.column}
                          </Typography>
                          <Chip
                            size="small"
                            label={rec.task}
                            color={rec.task === 'classification' ? 'primary' : 'secondary'}
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {rec.reason}
                        </Typography>
                        {rec.business_process && (
                          <Chip
                            size="small"
                            label={rec.business_process}
                            variant="outlined"
                            sx={{ mr: 0.5 }}
                          />
                        )}
                        {warnings && (
                          <Tooltip title={warnings.warnings.join('; ')}>
                            <Chip
                              size="small"
                              icon={<WarningIcon />}
                              label="Has warnings"
                              color={warnings.severity === 'high' ? 'error' : 'warning'}
                              variant="outlined"
                            />
                          </Tooltip>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Manual Selection */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Or Select Any Column
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Target Column</InputLabel>
              <Select
                value={targetColumn || ''}
                label="Target Column"
                onChange={(e) => handleTargetSelect(e.target.value)}
              >
                {columns.map((col) => (
                  <MenuItem key={col.name} value={col.name}>
                    {col.name}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      ({col.dtype})
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Task Type</InputLabel>
              <Select
                value={task}
                label="Task Type"
                onChange={(e) => setTask(e.target.value as TaskType)}
              >
                <MenuItem value="classification">
                  Classification
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    (Predict categories like Yes/No, Status)
                  </Typography>
                </MenuItem>
                <MenuItem value="regression">
                  Regression
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    (Predict numbers like Price, Revenue)
                  </Typography>
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Box>

      {/* Target Warnings */}
      {targetColumn && getWarningsForColumn(targetColumn) && (
        <Alert
          severity={getWarningsForColumn(targetColumn)!.severity === 'high' ? 'error' : 'warning'}
          sx={{ mb: 3 }}
        >
          <Typography variant="subtitle2">Target Column Warnings</Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {getWarningsForColumn(targetColumn)!.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Feature Preview */}
      {targetColumn && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Features to Use ({featureColumns.length} columns)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {featureColumns.slice(0, 15).map((col) => (
              <Chip key={col.name} label={col.name} size="small" />
            ))}
            {featureColumns.length > 15 && (
              <Chip label={`+${featureColumns.length - 15} more`} size="small" variant="outlined" />
            )}
          </Box>
        </Box>
      )}

      {/* Advanced Options */}
      <Box sx={{ mb: 3 }}>
        <Button
          onClick={() => setShowAdvanced(!showAdvanced)}
          endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          size="small"
        >
          Advanced: Exclude Columns
        </Button>
        <Collapse in={showAdvanced}>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Select columns to exclude from training (IDs and timestamps are auto-excluded)
            </Typography>
            <FormGroup row>
              {columns
                .filter((c) => c.name !== targetColumn)
                .map((col) => (
                  <FormControlLabel
                    key={col.name}
                    control={
                      <Checkbox
                        checked={excludedColumns.includes(col.name)}
                        onChange={() => handleExcludedToggle(col.name)}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {col.name}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {' '}
                          ({col.dtype})
                        </Typography>
                      </Typography>
                    }
                  />
                ))}
            </FormGroup>
          </Box>
        </Collapse>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outlined" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="contained"
          size="large"
          disabled={!targetColumn}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
};

export default TargetSelectionStep;
