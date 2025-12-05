export interface LastGdmJobMetadata {
  jobId: string;
  databaseId?: string | null;
  completedAt?: string | null;
  modelUsed?: string | null;
}

const STORAGE_KEY = 'cerebro:last-gdm-job';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const loadLastGdmJob = (): LastGdmJobMetadata | null => {
  if (!isBrowser) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastGdmJobMetadata;
  } catch (error) {
    console.warn('Failed to parse GDM job metadata:', error);
    return null;
  }
};

export const saveLastGdmJob = (payload: LastGdmJobMetadata) => {
  if (!isBrowser) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist latest GDM job metadata:', error);
  }
};
