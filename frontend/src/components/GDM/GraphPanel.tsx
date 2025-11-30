import SearchIcon from '@mui/icons-material/Search';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import TuneIcon from '@mui/icons-material/Tune';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import {
  Box,
  IconButton,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Chip,
  InputAdornment,
  Dialog,
  Divider,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import React, { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GDMGraphEdge, GDMGraphNode } from '../../services/gdmApi';
import EntityDrawer from './EntityDrawer';

interface GraphPanelProps {
  nodes: GDMGraphNode[];
  edges: GDMGraphEdge[];
  highlightedNodes?: string[];
  onHighlightClear?: () => void;
  onPreviewEntity?: (entityId: string) => void;
}

interface GraphCanvasProps {
  rfNodes: Node[];
  rfEdges: Edge[];
  onSelectNode: (entityId: string) => void;
  fitViewToken: number;
  canvasBg: string;
  gridColor: string;
  controlsStyle: React.CSSProperties;
}

const GraphCanvasInner: React.FC<GraphCanvasProps> = ({
  rfNodes,
  rfEdges,
  onSelectNode,
  fitViewToken,
  canvasBg,
  gridColor,
  controlsStyle,
}) => {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (rfNodes.length) {
      fitView({ padding: 0.2, duration: 500 });
    }
  }, [rfNodes, rfEdges, fitView, fitViewToken]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      fitView
      style={{ background: canvasBg }}
    >
      <Background gap={16} color={gridColor} />
      <Controls showInteractive={false} style={controlsStyle} />
      <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.06)" />
    </ReactFlow>
  );
};

const GraphCanvas: React.FC<GraphCanvasProps> = (props) => (
  <ReactFlowProvider>
    <GraphCanvasInner {...props} />
  </ReactFlowProvider>
);

const GraphPanel: React.FC<GraphPanelProps> = ({
  nodes,
  edges,
  highlightedNodes = [],
  onHighlightClear,
  onPreviewEntity,
}) => {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [minDegree, setMinDegree] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitViewToken, setFitViewToken] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const highlightSet = useMemo(() => new Set(highlightedNodes), [highlightedNodes]);
  const maxDegreeValue = useMemo(() => nodes.reduce((max, node) => Math.max(max, node.degree), 0), [nodes]);
  const sliderMax = Math.max(3, maxDegreeValue);

  useEffect(() => {
    if (minDegree > sliderMax) {
      setMinDegree(sliderMax);
    }
  }, [sliderMax, minDegree]);

  const filteredNodes = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return nodes.filter((node) => {
      if (node.degree < minDegree) return false;
      if (!lowered) return true;
      return (
        node.label.toLowerCase().includes(lowered) ||
        node.name.toLowerCase().includes(lowered) ||
        node.schema.toLowerCase().includes(lowered)
      );
    });
  }, [nodes, search, minDegree]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes]);

  const rfNodes: Node[] = useMemo(() => {
    return filteredNodes.map((node) => {
      const isHighlighted = highlightSet.size === 0 || highlightSet.has(node.id);
      const baseBg =
        theme.palette.mode === 'dark'
          ? alpha(theme.palette.common.white, 0.04)
          : alpha(theme.palette.primary.main, 0.06);
      const highlightBg =
        theme.palette.mode === 'dark'
          ? alpha(theme.palette.primary.main, 0.25)
          : alpha(theme.palette.primary.main, 0.16);

      return {
        id: node.id,
        data: { label: node.label, entity: node },
        position: node.position ?? { x: 0, y: 0 },
        style: {
          padding: 12,
          borderRadius: 12,
          border: `2px solid ${
            isHighlighted ? theme.palette.primary.main : theme.palette.divider
          }`,
          background: isHighlighted ? highlightBg : baseBg,
          color: theme.palette.text.primary,
          fontWeight: 600,
          opacity: isHighlighted ? 1 : 0.6,
        },
      } as Node;
    });
  }, [
    filteredNodes,
    highlightSet,
    theme.palette.common.white,
    theme.palette.divider,
    theme.palette.mode,
    theme.palette.primary.main,
    theme.palette.text.primary,
  ]);

  const rfEdges: Edge[] = useMemo(() => {
    const strokeColor = alpha(
      theme.palette.text.primary,
      theme.palette.mode === 'dark' ? 0.5 : 0.42,
    );

    return edges
      .filter((edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        style: { stroke: strokeColor, strokeWidth: 1.5 },
        labelBgPadding: [6, 2],
        labelBgBorderRadius: 8,
        labelBgStyle: {
          fill:
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.common.black, 0.65)
              : alpha(theme.palette.common.white, 0.8),
          color: theme.palette.text.primary,
        },
        labelStyle: {
          fill: theme.palette.text.primary,
          fontWeight: 600,
        },
      }));
  }, [
    edges,
    filteredNodeIds,
    theme.palette.common.black,
    theme.palette.common.white,
    theme.palette.mode,
    theme.palette.text.primary,
  ]);

  const selectedEntity = selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null;
  const canvasBg =
    theme.palette.mode === 'dark'
      ? 'linear-gradient(180deg, #0c110f 0%, #0a0e0c 100%)'
      : 'linear-gradient(180deg, #f9fbf9 0%, #eef3ef 100%)';
  const gridColor = alpha(
    theme.palette.text.primary,
    theme.palette.mode === 'dark' ? 0.2 : 0.12,
  );
  const controlsStyle = {
    background: theme.palette.mode === 'dark' ? alpha('#0b0f0d', 0.92) : '#0b0f0d',
    color: theme.palette.common.white,
    border: `1px solid ${alpha(theme.palette.common.white, 0.16)}`,
    boxShadow:
      theme.palette.mode === 'dark'
        ? '0 8px 20px rgba(0,0,0,0.35)'
        : '0 10px 22px rgba(0,0,0,0.25)',
  };

  useEffect(() => {
    if (fullscreen) {
      setFitViewToken((token) => token + 1);
    }
  }, [fullscreen]);

  const renderControls = (inFullscreen = false) => (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      alignItems="center"
      sx={{ mb: 2, mt: inFullscreen ? 0 : undefined }}
    >
      <TextField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search entities"
        size="small"
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', maxWidth: 320 }}>
        <TuneIcon fontSize="small" />
        <Slider
          min={0}
          max={sliderMax}
          step={1}
          size="small"
          value={Math.min(minDegree, sliderMax)}
          onChange={(_, value) => setMinDegree(value as number)}
          valueLabelDisplay="auto"
        />
        <Typography variant="caption" color="text.secondary">
          Degree ≥ {minDegree}
        </Typography>
      </Stack>
      <Tooltip title="Reset filters">
        <span>
          <IconButton onClick={() => setMinDegree(0)} disabled={minDegree === 0}>
            <FilterAltOffIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Zoom to fit">
        <IconButton
          onClick={() => {
            setSelectedId(null);
            setFitViewToken((token) => token + 1);
          }}
        >
          <CenterFocusStrongIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={fullscreen ? 'Exit full screen' : 'Full screen'}>
        <IconButton onClick={() => setFullscreen((open) => !open)}>
          {fullscreen ? <CloseFullscreenIcon /> : <OpenInFullIcon />}
        </IconButton>
      </Tooltip>
      {highlightSet.size > 0 && (
        <Chip color="secondary" label={`Highlighting ${highlightSet.size} nodes`} onDelete={onHighlightClear} />
      )}
    </Stack>
  );

  const renderGraphArea = (height: number | string) => (
    <Box
      sx={{
        height,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 14px 28px rgba(0,0,0,0.35)'
            : '0 12px 24px rgba(11,15,13,0.12)',
      }}
    >
      <GraphCanvas
        rfNodes={rfNodes}
        rfEdges={rfEdges}
        onSelectNode={setSelectedId}
        fitViewToken={fitViewToken}
        canvasBg={canvasBg}
        gridColor={gridColor}
        controlsStyle={controlsStyle}
      />
    </Box>
  );

  return (
    <Box>
      {renderControls()}
      {renderGraphArea(420)}

      <EntityDrawer
        entity={selectedEntity}
        onClose={() => setSelectedId(null)}
        onPreviewJson={onPreviewEntity}
      />

      <Dialog
        fullScreen
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        PaperProps={{ sx: { backgroundColor: theme.palette.background.default } }}
      >
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h6">Semantic Graph</Typography>
            <Chip
              label={`${rfNodes.length} entities`}
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ ml: 1 }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton onClick={() => setFullscreen(false)}>
              <CloseFullscreenIcon />
            </IconButton>
          </Stack>

          <Divider />
          {renderControls(true)}
          {renderGraphArea('calc(100vh - 230px)')}
        </Box>
      </Dialog>
    </Box>
  );
};

export default GraphPanel;
