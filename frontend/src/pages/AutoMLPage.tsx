import React, { useEffect } from 'react';
import { Box, Container, Typography, Chip } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import { AssistantProvider, useAssistant } from '../contexts/AssistantContext';
import PlaybookFlow from '../components/AutoML/PlaybookFlow';
import { loadLastGdmJob } from '../utils/gdmStorage';

const AutoMLSuiteContent: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { setGdmJobId } = useAssistant();

  useEffect(() => {
    const gdmFromQuery = searchParams.get('gdmJobId');
    const last = loadLastGdmJob();
    if (gdmFromQuery) {
      setGdmJobId(gdmFromQuery);
    } else if (last?.jobId) {
      setGdmJobId(last.jobId);
    }
  }, [searchParams, setGdmJobId]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.2em' }}>
            ASSISTANT SUITE
          </Typography>
          <Typography variant="h4">Playbook-driven AutoML</Typography>
          <Typography variant="body2" color="text.secondary">
            Select a Global Data Model recommendation, review the playbook, validate for leakage, and run AutoGluon with business-ready outputs.
          </Typography>
        </Box>
        <Chip
          icon={<AutoGraphIcon />}
          label="Powered by AutoGluon"
          color="success"
          variant="outlined"
        />
      </Box>

      <PlaybookFlow />
    </Container>
  );
};

const AutoMLPage: React.FC = () => (
  <AssistantProvider>
    <AutoMLSuiteContent />
  </AssistantProvider>
);

export default AutoMLPage;
