import React, { useMemo, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Button,
  Toolbar,
  AppBar,
  Tooltip,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  TextField,
  Badge,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  GridView as GridIcon,
  ViewList as ListIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Fullscreen as FullscreenIcon,
  Edit as EditIcon,
  Clear as ClearIcon,
  Save as SaveIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  removeChart,
  updateChart,
  clearDashboard,
  setLayout,
  DashboardChart,
} from '../../store/dashboardSlice';
import ChartDisplay from '../Analysis/ChartDisplay';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useChat } from '../../contexts/ChatContext';

const VisualizationsDashboard: React.FC = () => {
  const dispatch = useDispatch();
  const { charts, layout } = useSelector(
    (state: RootState) => state.dashboard
  );
  const { sessions, currentSessionId } = useChat();
  const [sessionFilter, setSessionFilter] = useState<string>(currentSessionId || 'all');
  const filteredCharts = useMemo(() => {
    if (sessionFilter === 'all') return charts;
    return charts.filter(c => c.metadata?.chatSessionId === sessionFilter);
  }, [charts, sessionFilter]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingChart, setEditingChart] = useState<DashboardChart | null>(null);
  const [fullscreenChart, setFullscreenChart] = useState<DashboardChart | null>(null);

  const handleLayoutChange = (newLayout: 'grid' | 'list' | 'dashboard') => {
    dispatch(setLayout(newLayout));
  };

  const handleChartEdit = (chart: DashboardChart) => {
    setEditingChart(chart);
    setEditDialogOpen(true);
  };

  const handleChartDelete = (chartId: string) => {
    dispatch(removeChart(chartId));
  };

  const handleSaveEdit = () => {
    if (editingChart) {
      dispatch(updateChart(editingChart));
      setEditDialogOpen(false);
      setEditingChart(null);
    }
  };

  const handleExportChart = (chart: DashboardChart) => {
    // Create a blob with the chart data
    const chartBlob = new Blob([JSON.stringify(chart, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(chartBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chart.title.replace(/\s+/g, '_')}_${chart.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDashboard = () => {
    const dashboardData = {
      charts,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(dashboardData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    
    // Reorder charts based on drag result
    const items = Array.from(charts);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update the store with new order
    // dispatch(reorderCharts(items.map(item => item.id)));
  };

  const renderChart = (chart: DashboardChart, index: number, isDraggable = false) => {
    const chartComponent = (
      <Paper
        elevation={3}
        sx={{
          p: 2,
          height: layout === 'list' ? 'auto' : 400,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          '&:hover': {
            boxShadow: 6,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Box>
            <Typography variant="h6" gutterBottom>
              {chart.title}
            </Typography>
            {chart.metadata?.query && (
              <Typography variant="caption" color="text.secondary" display="block">
                Query: {chart.metadata.query}
              </Typography>
            )}
            <Box sx={{ mt: 1 }}>
              <Chip
                label={chart.source}
                size="small"
                color={chart.source === 'chat' ? 'primary' : 'default'}
                sx={{ mr: 1 }}
              />
              <Chip
                label={new Date(chart.timestamp).toLocaleDateString()}
                size="small"
                variant="outlined"
              />
            </Box>
          </Box>
          <Box>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => handleChartEdit(chart)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton size="small" onClick={() => setFullscreenChart(chart)}>
                <FullscreenIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download">
              <IconButton size="small" onClick={() => handleExportChart(chart)}>
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => handleChartDelete(chart.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <ChartDisplay
            chartData={{
              type: chart.type,
              data: chart.data,
              config: chart.config,
              title: chart.title,
            }}
          />
        </Box>
      </Paper>
    );

    if (isDraggable) {
      return (
        <Draggable key={chart.id} draggableId={chart.id} index={index}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
            >
              {chartComponent}
            </div>
          )}
        </Draggable>
      );
    }

    return chartComponent;
  };

  if (charts.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 200px)',
        }}
      >
        <DashboardIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" color="text.secondary" gutterBottom>
          No Visualizations Yet
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
          Charts created from your chat conversations will appear here.
          <br />
          You can also create custom dashboards by sending charts from the chat interface.
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} href="/">
          Go to Chat
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Visualizations Dashboard
            <Badge badgeContent={charts.length} color="primary" sx={{ ml: 2 }}>
              <DashboardIcon />
            </Badge>
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
            <Tooltip title="Grid View">
              <IconButton
                onClick={() => handleLayoutChange('grid')}
                color={layout === 'grid' ? 'primary' : 'default'}
              >
                <GridIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="List View">
              <IconButton
                onClick={() => handleLayoutChange('list')}
                color={layout === 'list' ? 'primary' : 'default'}
              >
                <ListIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Dashboard View">
              <IconButton
                onClick={() => handleLayoutChange('dashboard')}
                color={layout === 'dashboard' ? 'primary' : 'default'}
              >
                <DashboardIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <FormControl size="small" sx={{ mr: 2, minWidth: 220 }}>
            <InputLabel>Session</InputLabel>
            <Select label="Session" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
              <MenuItem value="all">All Sessions</MenuItem>
              {sessions.map(s => (
                <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={handleExportDashboard}
            sx={{ mr: 1 }}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={() => dispatch(clearDashboard())}
            color="error"
          >
            Clear All
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 3 }}>
        {layout === 'grid' && (
          <Grid container spacing={3}>
            {filteredCharts.map((chart, index) => (
              <Grid item xs={12} md={6} lg={4} key={chart.id}>
                {renderChart(chart, index)}
              </Grid>
            ))}
          </Grid>
        )}

        {layout === 'list' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredCharts.map((chart, index) => (
              <Box key={chart.id}>{renderChart(chart, index)}</Box>
            ))}
          </Box>
        )}

        {layout === 'dashboard' && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="dashboard">
              {(provided) => (
                <Grid
                  container
                  spacing={3}
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {filteredCharts.map((chart, index) => (
                    <Grid item xs={12} md={6} lg={4} key={chart.id}>
                      {renderChart(chart, index, true)}
                    </Grid>
                  ))}
                  {provided.placeholder}
                </Grid>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </Box>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Chart</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Title"
            value={editingChart?.title || ''}
            onChange={(e) =>
              setEditingChart(editingChart ? { ...editingChart, title: e.target.value } : null)
            }
            margin="normal"
          />
          <TextField
            fullWidth
            label="Description"
            value={editingChart?.metadata?.description || ''}
            onChange={(e) =>
              setEditingChart(
                editingChart
                  ? {
                      ...editingChart,
                      metadata: { ...editingChart.metadata, description: e.target.value },
                    }
                  : null
              )
            }
            margin="normal"
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Fullscreen Dialog */}
      <Dialog
        open={!!fullscreenChart}
        onClose={() => setFullscreenChart(null)}
        fullScreen
      >
        {fullscreenChart && (
          <>
            <AppBar sx={{ position: 'relative' }}>
              <Toolbar>
                <Typography sx={{ flex: 1 }} variant="h6">
                  {fullscreenChart.title}
                </Typography>
                <IconButton
                  edge="end"
                  color="inherit"
                  onClick={() => setFullscreenChart(null)}
                >
                  <DeleteIcon />
                </IconButton>
              </Toolbar>
            </AppBar>
            <Box sx={{ p: 3, height: 'calc(100vh - 64px)' }}>
              <ChartDisplay
                chartData={{
                  type: fullscreenChart.type,
                  data: fullscreenChart.data,
                  config: fullscreenChart.config,
                  title: fullscreenChart.title,
                }}
              />
            </Box>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default VisualizationsDashboard;
