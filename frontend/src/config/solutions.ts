export type SolutionState = 'available' | 'coming-soon' | 'disabled';

export interface SolutionConfig {
  id: string;
  title: string;
  subtitle?: string;
  state: SolutionState;
  badge?: string;
  image?: string;
  tags?: string[];
  route: string;
}

export const solutions: SolutionConfig[] = [
  {
    id: 'db-ai-analysis',
    title: 'Interact with your database',
    subtitle: 'Deep AI analysis of your database',
    state: 'available',
    badge: 'ENTERPRISE',
    image:
      'linear-gradient(135deg, rgba(118, 185, 0, 0.35) 0%, rgba(0, 180, 216, 0.12) 50%, rgba(11, 15, 13, 0.85) 100%)',
    route: '/solutions/db',
    tags: ['blueprint', 'database', 'analysis'],
  },
  {
    id: 'realtime-rag',
    title: 'Real-Time Data Analysis',
    subtitle: 'Connect real-time data to a RAG solution',
    state: 'coming-soon',
    badge: 'COMING SOON',
    image:
      'linear-gradient(135deg, rgba(0, 180, 216, 0.32) 0%, rgba(118, 185, 0, 0.18) 45%, rgba(11, 15, 13, 0.9) 100%)',
    route: '/solutions/realtime',
    tags: ['rag', 'streaming', 'coming-soon'],
  },
];
