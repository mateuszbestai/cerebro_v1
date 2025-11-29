import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ArtifactTabs from '../components/GDM/ArtifactTabs';
import GraphPanel from '../components/GDM/GraphPanel';
import InsightCards from '../components/GDM/InsightCards';
import RelationshipsReview from '../components/GDM/RelationshipsReview';
import StoryTimeline from '../components/GDM/StoryTimeline';
import UseForAIButton from '../components/GDM/UseForAIButton';
import {
  gdmApi,
  GDMRelationshipReview,
  GDMResultsResponse,
  GDMInsight,
  GDMTimelineItem,
} from '../services/gdmApi';
import { saveLastGdmJob } from '../utils/gdmStorage';
import PlaybookFromGDM from '../components/Playbooks/PlaybookFromGDM';

const DEFAULT_ARTIFACT = 'global_model.json';

const MetricsGrid: React.FC<{ results?: GDMResultsResponse; loading: boolean }> = ({ results, loading }) => {
  if (loading || !results) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Grid item xs={12} md={3} key={index}>
            <Skeleton variant="rounded" height={110} />
          </Grid>
        ))}
      </Grid>
    );
  }

  const cards = [
    { label: 'Entities', value: results.entity_count.toLocaleString() },
    { label: 'Relationships', value: results.relationship_count.toLocaleString() },
    { label: 'Facts', value: results.stats.facts.toLocaleString() },
    { label: 'Dimensions', value: results.stats.dimensions.toLocaleString() },
  ];

  return (
    <Grid container spacing={2}>
      {cards.map((card) => (
        <Grid item xs={12} md={3} key={card.label}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" sx={{ color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
                {card.label}
              </Typography>
              <Typography variant="h4">{card.value}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

const GDMResults: React.FC = () => {
  const { jobId: routeJobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const jobId = routeJobId || searchParams.get('jobId') || '';
  const queryClient = useQueryClient();

  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [activeArtifact, setActiveArtifact] = useState(DEFAULT_ARTIFACT);
  const [focusedEntity, setFocusedEntity] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const resultsQuery = useQuery({
    queryKey: ['gdmResults', jobId],
    queryFn: () => gdmApi.getResults(jobId),
    enabled: Boolean(jobId),
    retry: 2,
  });

  const summaryQuery = useQuery({
    queryKey: ['gdmSummary', jobId],
    queryFn: () => gdmApi.getNaturalLanguageSummary(jobId),
    enabled: Boolean(jobId),
    retry: 2,
  });

  const insightsQuery = useQuery({
    queryKey: ['gdmInsights', jobId],
    queryFn: () => gdmApi.getInsights(jobId),
    enabled: Boolean(jobId),
    retry: 2,
  });

  const relationshipsQuery = useQuery({
    queryKey: ['gdmRelationships', jobId],
    queryFn: () => gdmApi.getRelationships(jobId),
    enabled: Boolean(jobId),
    retry: 2,
  });

  const confirmMutation = useMutation({
    mutationFn: (ids: string[]) => gdmApi.confirmRelationships(jobId, ids),
    onSuccess: (data: GDMRelationshipReview) => {
      queryClient.setQueryData(['gdmRelationships', jobId], data);
      queryClient.invalidateQueries({ queryKey: ['gdmResults', jobId], exact: true });
    },
    onError: () => setToast({ message: 'Unable to confirm relationships', severity: 'error' }),
  });

  const aiToggleMutation = useMutation({
    mutationFn: (enable: boolean) => gdmApi.setUseForAI(jobId, enable),
    onSuccess: (state) => {
      queryClient.setQueryData<GDMResultsResponse | undefined>(['gdmResults', jobId], (prev) =>
        prev ? { ...prev, ai_usage_enabled: state.enabled } : prev
      );
      setToast({
        message: state.enabled
          ? 'AI queries will include this GDM as grounding context.'
          : 'AI routing reverted to default sources.',
        severity: 'success',
      });
    },
    onError: () => setToast({ message: 'Unable to update AI routing', severity: 'error' }),
  });

  const handleInsightSelect = (nodes: string[]) => {
    setHighlightedNodes(nodes);
  };

  const handlePreviewEntity = (entityId: string) => {
    setActiveArtifact(DEFAULT_ARTIFACT);
    setFocusedEntity(entityId);
    const anchor = document.getElementById('gdm-artifacts');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleClearFocus = () => setFocusedEntity(null);

  if (!jobId) {
    return <Alert severity="warning">Provide a job id via the route or ?jobId= query string.</Alert>;
  }

  const results = resultsQuery.data;
  const summary = summaryQuery.data;
  const insights = insightsQuery.data;
  const timeline: GDMTimelineItem[] = results?.timeline ?? [];

  const handlePlaybookGenerated = (pb: { name: string }) => {
    setToast({ message: `Playbook "${pb.name}" created from this GDM.`, severity: 'success' });
  };

  useEffect(() => {
    if (results?.job_id) {
      saveLastGdmJob({
        jobId: results.job_id,
        databaseId: results.database_id,
        completedAt: results.completed_at,
        modelUsed: results.model_used,
      });
    }
  }, [results?.job_id, results?.database_id, results?.completed_at, results?.model_used]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: '0.2em', color: 'var(--text-muted)' }}>
              GLOBAL DATA MODEL
            </Typography>
            <Typography variant="h4">GDM Results</Typography>
            <Typography variant="body2" color="text.secondary">
              Job {jobId}
            </Typography>
            {resultsQuery.isFetching && <CircularProgress size={16} sx={{ mt: 1 }} />}
          </Box>
          {results && (
            <UseForAIButton
              enabled={results.ai_usage_enabled}
              onToggle={(next) => aiToggleMutation.mutate(next)}
              loading={aiToggleMutation.isPending}
            />
          )}
        </Stack>
        {summary && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {summary.summary}
          </Alert>
        )}
        {summaryQuery.isLoading && <Skeleton variant="rounded" height={80} />}

        {results && (
          <Box sx={{ mt: 3 }}>
            <PlaybookFromGDM jobId={jobId} results={results} onGenerated={handlePlaybookGenerated} />
          </Box>
        )}
      </Box>

      {resultsQuery.isError && <Alert severity="error">Unable to load GDM results.</Alert>}

      <MetricsGrid results={results} loading={resultsQuery.isLoading} />

      {results?.warnings?.length ? (
        <Alert severity="warning">
          {results.warnings.map((warning) => (
            <Box key={warning}>{warning}</Box>
          ))}
        </Alert>
      ) : null}

      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Semantic Graph
        </Typography>
        <GraphPanel
          nodes={results?.graph.nodes ?? []}
          edges={results?.graph.edges ?? []}
          highlightedNodes={highlightedNodes}
          onHighlightClear={() => setHighlightedNodes([])}
          onPreviewEntity={handlePreviewEntity}
        />
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Quick Insights
        </Typography>
        {insightsQuery.isError && <Alert severity="warning">Unable to load insights.</Alert>}
        <InsightCards
          insights={insights as GDMInsight[]}
          loading={insightsQuery.isLoading}
          onSelect={handleInsightSelect}
        />
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Artifact Preview
        </Typography>
        {results ? (
          <ArtifactTabs
            jobId={jobId}
            artifacts={results.artifacts}
            missingArtifacts={results.missing_artifacts}
            activeTab={activeArtifact}
            onTabChange={setActiveArtifact}
            focusEntityId={focusedEntity}
            onClearFocus={handleClearFocus}
          />
        ) : (
          <Skeleton variant="rounded" height={320} />
        )}
      </Box>

      <RelationshipsReview
        review={relationshipsQuery.data}
        loading={relationshipsQuery.isLoading}
        confirming={confirmMutation.isPending}
        onConfirm={(ids) => confirmMutation.mutate(ids)}
      />
      {relationshipsQuery.isError && <Alert severity="error">Unable to load relationships.</Alert>}

      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Story Timeline
        </Typography>
        <StoryTimeline items={timeline} />
      </Box>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast?.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default GDMResults;
