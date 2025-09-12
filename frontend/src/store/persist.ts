// Simple Redux state persistence to localStorage for analysis history and dashboard charts
// No secrets are stored here. This is browser-side only.

export type PersistedState = {
  analysis?: {
    history: any[];
  };
  dashboard?: {
    charts: any[];
    layout: 'grid' | 'list' | 'dashboard';
  };
};

const STORAGE_KEY = 'cerebro_app_state_v1';

export function loadState(): PersistedState | undefined {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return undefined;
    return JSON.parse(serialized);
  } catch (e) {
    console.warn('Failed to load persisted state:', e);
    return undefined;
  }
}

export function saveState(state: PersistedState) {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    console.warn('Failed to persist state:', e);
  }
}

