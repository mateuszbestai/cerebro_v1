import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import Papa from 'papaparse';
import mermaid from 'mermaid';
import React, { useEffect, useMemo, useState } from 'react';
import { JsonViewer } from '@textea/json-viewer';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { materialDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { GDMArtifact, gdmApi } from '../../services/gdmApi';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

type ArtifactKind = 'json' | 'csv' | 'sql' | 'mermaid';

const ARTIFACT_ORDER = [
  'global_model.json',
  'glossary.json',
  'relationships.csv',
  'model.mmd',
  'conformed_views.sql',
];

interface ArtifactTabsProps {
  jobId: string;
  artifacts: GDMArtifact[];
  missingArtifacts: string[];
  activeTab: string;
  onTabChange: (name: string) => void;
  focusEntityId?: string | null;
  onClearFocus?: () => void;
}

interface ArtifactContent {
  loading: boolean;
  error?: string;
  data?: any;
  kind?: ArtifactKind;
}

const MermaidPreview: React.FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const { svg } = await mermaid.render(`gdm-${Date.now()}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Unable to render Mermaid diagram');
        }
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">{error}</Alert>
        <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
          <pre>{code}</pre>
        </Paper>
      </Stack>
    );
  }

  return <Box dangerouslySetInnerHTML={{ __html: svg }} sx={{ '& svg': { width: '100%' } }} />;
};

const detectKind = (name: string): ArtifactKind => {
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.mmd')) return 'mermaid';
  return 'sql';
};

const ArtifactTabs: React.FC<ArtifactTabsProps> = ({
  jobId,
  artifacts,
  missingArtifacts,
  activeTab,
  onTabChange,
  focusEntityId,
  onClearFocus,
}) => {
  const artifactMap = useMemo(() => {
    const map: Record<string, GDMArtifact> = {};
    artifacts.forEach((artifact) => {
      map[artifact.name] = artifact;
    });
    return map;
  }, [artifacts]);

  const [contentState, setContentState] = useState<Record<string, ArtifactContent>>({});

  useEffect(() => {
    setContentState({});
  }, [jobId]);

  useEffect(() => {
    const loadContent = async () => {
      const artifact = artifactMap[activeTab];
      if (!artifact || contentState[activeTab]?.data || contentState[activeTab]?.loading) {
        return;
      }
      const kind = detectKind(activeTab);
      setContentState((state) => ({
        ...state,
        [activeTab]: { ...state[activeTab], loading: true, kind },
      }));
      try {
        let data: any;
        if (kind === 'json') {
          data = await gdmApi.fetchArtifactJson(jobId, activeTab);
        } else {
          const text = await gdmApi.fetchArtifactText(jobId, activeTab);
          if (kind === 'csv') {
            const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
            data = {
              headers: parsed.meta.fields || [],
              rows: (parsed.data as Record<string, any>[]).slice(0, 200),
            };
          } else {
            data = text;
          }
        }
        setContentState((state) => ({
          ...state,
          [activeTab]: { loading: false, data, kind },
        }));
      } catch (err: any) {
        setContentState((state) => ({
          ...state,
          [activeTab]: { loading: false, error: err?.message || 'Unable to load artifact', kind },
        }));
      }
    };
    loadContent();
  }, [activeTab, artifactMap, contentState, jobId]);

  const renderContent = () => {
    if (!artifactMap[activeTab]) {
      return <Alert severity="warning">This artifact is not available for the selected job.</Alert>;
    }

    const state = contentState[activeTab];
    if (!state || state.loading) {
      return <Skeleton variant="rounded" height={260} />;
    }
    if (state.error) {
      return <Alert severity="error">{state.error}</Alert>;
    }

    switch (state.kind) {
      case 'json':
        return (
          <JsonViewer
            value={state.data}
            theme="dark"
            displayDataTypes={false}
            defaultInspectDepth={2}
            rootName={false}
          />
        );
      case 'csv':
        return (
          <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {state.data.headers.map((header: string) => (
                    <TableCell key={header}>{header}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {state.data.rows.map((row: Record<string, any>, rowIndex: number) => (
                  <TableRow key={`${rowIndex}-${row[state.data.headers[0]] || rowIndex}`}>
                    {state.data.headers.map((header: string) => (
                      <TableCell key={header}>{row[header]}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        );
      case 'mermaid':
        return <MermaidPreview code={state.data as string} />;
      case 'sql':
      default:
        return (
          <SyntaxHighlighter language="sql" style={materialDark} customStyle={{ borderRadius: 16 }}>
            {state.data}
          </SyntaxHighlighter>
        );
    }
  };

  const handleCopy = async () => {
    const artifact = contentState[activeTab];
    if (!artifact || artifact.loading || artifact.error) return;
    const text =
      artifact.kind === 'json' ? JSON.stringify(artifact.data, null, 2) : (artifact.data as string) ?? '';
    await navigator.clipboard.writeText(text);
  };

  const focusLabel = focusEntityId ? focusEntityId.split('.').pop() : null;

  return (
    <Box id="gdm-artifacts">
      <Tabs
        value={activeTab}
        onChange={(_, value) => onTabChange(value)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {ARTIFACT_ORDER.map((name) => (
          <Tab key={name} value={name} label={name.replace('.json', '').replace('.sql', '').replace('.csv', '')} disabled={!artifactMap[name]} />
        ))}
      </Tabs>
      <Divider />

      {focusLabel && (
        <Chip
          sx={{ mt: 2 }}
          color="primary"
          label={`Focused on ${focusLabel}`}
          onDelete={onClearFocus ?? undefined}
        />
      )}

      {missingArtifacts.length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Missing artifacts: {missingArtifacts.join(', ')}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Tooltip title="Download artifact">
          <span>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              component="a"
              href={gdmApi.getArtifactUrl(jobId, activeTab)}
              disabled={!artifactMap[activeTab]}
            >
              Download
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Copy to clipboard">
          <span>
            <IconButton
              onClick={handleCopy}
              disabled={!contentState[activeTab] || contentState[activeTab]?.loading || Boolean(contentState[activeTab]?.error)}
            >
              <ContentCopyIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Box sx={{ mt: 2 }}>{renderContent()}</Box>
    </Box>
  );
};

export default ArtifactTabs;
