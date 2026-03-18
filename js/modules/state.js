export const state = {
  projects: [],
  editId: null,
  currentFilter: 'all',
  isSyncing: false,
  appConfig: { headerName: '', monthTargets: {}, profile: { name: '', userId: '', teamName: '', preCarry: 0, newCarry: 0 } },
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
