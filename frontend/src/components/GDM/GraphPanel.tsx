import SearchIcon from '@mui/icons-material/Search';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import TuneIcon from '@mui/icons-material/Tune';
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
} from '@mui/material';
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
}

const GraphCanvasInner: React.FC<GraphCanvasProps> = ({ rfNodes, rfEdges, onSelectNode, fitViewToken }) => {
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
      style={{ background: 'var(--surface)' }}
    >
      <Background gap={16} color="rgba(255,255,255,0.08)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
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
  const [search, setSearch] = useState('');
  const [minDegree, setMinDegree] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitViewToken, setFitViewToken] = useState(0);

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
      return {
        id: node.id,
        data: { label: node.label, entity: node },
        position: node.position ?? { x: 0, y: 0 },
        style: {
          padding: 12,
          borderRadius: 12,
          border: `2px solid ${isHighlighted ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}`,
          background: isHighlighted ? 'rgba(118,185,0,0.18)' : 'rgba(255,255,255,0.04)',
          color: 'var(--text)',
          fontWeight: 600,
          opacity: isHighlighted ? 1 : 0.35,
        },
      } as Node;
    });
  }, [filteredNodes, highlightSet]);

  const rfEdges: Edge[] = useMemo(() => {
    return edges
      .filter((edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        style: { stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1.5 },
      }));
  }, [edges, filteredNodeIds]);

  const selectedEntity = selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null;

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" sx={{ mb: 2 }}>
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
        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', maxWidth: 300 }}>
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
        {highlightSet.size > 0 && (
          <Chip
            color="secondary"
            label={`Highlighting ${highlightSet.size} nodes`}
            onDelete={onHighlightClear}
          />
        )}
      </Stack>

      <Box sx={{ height: 420, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <GraphCanvas
          rfNodes={rfNodes}
          rfEdges={rfEdges}
          onSelectNode={setSelectedId}
          fitViewToken={fitViewToken}
        />
      </Box>

      <EntityDrawer
        entity={selectedEntity}
        onClose={() => setSelectedId(null)}
        onPreviewJson={onPreviewEntity}
      />
    </Box>
  );
};

export default GraphPanel;
