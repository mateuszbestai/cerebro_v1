import React from 'react';
import { Box } from '@mui/material';
import { SolutionConfig } from '../../config/solutions';
import SolutionCard from './SolutionCard';

interface SolutionsGridProps {
  items: SolutionConfig[];
}

const SolutionsGrid: React.FC<SolutionsGridProps> = ({ items }) => {
  return (
    <Box
      component="section"
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        alignItems: 'stretch',
      }}
    >
      {items.map((item) => (
        <SolutionCard key={item.id} {...item} href={item.route} />
      ))}
    </Box>
  );
};

export default SolutionsGrid;
