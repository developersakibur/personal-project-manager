export const state = {
  projects: [],
  editId: null,
  currentFilter: 'all',
  selectedQuarter: null, // { year: 2026, qIdx: 1 } (0=Jan-Mar, 1=Apr-Jun, 2=Jul-Sep, 3=Oct-Dec)
  targetQuarter: null, // For account settings quarter selection (e.g. "2026-1")
  isSyncing: false,
  appConfig: { 
    headerName: '', 
    quarterConfigs: {}, // { '2026-1': { min: 3300, preCarry: 0, newCarry: 0 } }
    profile: { name: '', userId: '', teamName: '', preCarry: 0, newCarry: 0 } 
  },
  tokenClient: null,
  gapiInited: false,
  gisInited: false,
  driveFileId: null,
  monthSorts: {} // { '2024-03': { col: 'deadline', dir: 'asc' } }
};

export const CATEGORIES = [
  { id: 'running', label: 'Running', color: '#3b82f6' },
  { id: 'revision', label: 'Revision', color: '#ef4444' },
  { id: 'delivered', label: 'Completed', color: '#10b981' }
];

export function getCD(deadline) {
  if (!deadline) return null;
  const target = new Date(deadline);
  if (isNaN(target.getTime())) return null;
  
  const diff = target - new Date();
  if (diff <= 0) return null;
  
  const d = Math.floor(diff / 864e5), h = Math.floor(diff % 864e5 / 36e5), m = Math.floor(diff % 36e5 / 6e4), s = Math.floor(diff % 6e4 / 1e3);
  return { d, h, m, s, total: diff };
}

export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
