import { state, getCD } from './modules/state.js';
import { initGapi, initGis, startupCheck } from './modules/auth.js';
import { render, downloadTodayReport, copyWorkReport } from './modules/ui.js';
import { syncFromCloud, syncToCloud } from './modules/drive.js';
import { 
  setFilter, setQuarter, setTargetQuarter, openModal, saveProject, deleteProjectFromModal, 
  closeModal, toggleDeliveryFields, saveProfile, updateHeaderName,
  exportData, importData, eraseAllData, sanitizeData, syncStatusSelect, toggleSort
} from './modules/actions.js';

// 1. EXPOSE TO WINDOW (For HTML event handlers)
window.gapiLoaded = () => initGapi(startupCheck);
window.gisLoaded = () => initGis(startupCheck);
window.handleAuthClick = () => state.tokenClient.requestAccessToken({ prompt: 'consent' });
window.handleDisconnect = () => { if (confirm('Sign out?')) { localStorage.removeItem('google_token'); location.reload(); } };

window.setFilter = setFilter;
window.setQuarter = setQuarter;
window.setTargetQuarter = setTargetQuarter;
window.render = render;
window.openModal = openModal;
window.saveProject = saveProject;
window.deleteProjectFromModal = deleteProjectFromModal;
window.closeModal = closeModal;
window.handleOverlayClick = (e) => { if (e.target.className === 'modal-overlay') window.closeModal(); };
window.toggleDeliveryFields = toggleDeliveryFields;
window.saveProfile = saveProfile;
window.updateHeaderName = updateHeaderName;
window.downloadTodayReport = downloadTodayReport;
window.copyWorkReport = copyWorkReport;
window.exportData = exportData;
window.importData = importData;
window.eraseAllData = eraseAllData;
window.syncStatusSelect = syncStatusSelect;
window.toggleSort = toggleSort;

// 2. INITIALIZE APP
document.addEventListener('DOMContentLoaded', () => { 
  window.appStarted = true;
  try {
    // Load local cache immediately for perceived performance
    const localData = localStorage.getItem('p_data');
    const localConfig = localStorage.getItem('app_config');
    
    if (localData) {
      state.projects = JSON.parse(localData); 
      sanitizeData();
    }
    if (localConfig) state.appConfig = JSON.parse(localConfig);
    
    // Start background timers
    setInterval(() => { 
      const now = new Date();
      const ct = document.getElementById('clockTime'), cd = document.getElementById('clockDate');
      if (ct) ct.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
      if (cd) cd.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
      
      // Update live countdowns in table
      if (state.currentFilter !== 'today' && state.currentFilter !== 'account') {
        document.querySelectorAll('.timer-pill').forEach(pill => {
          const deadlineStr = pill.getAttribute('data-deadline');
          const startStr = pill.getAttribute('data-start');
          const res = getCD(deadlineStr);
          const valEl = pill.querySelector('.timer-val');
          
          if (res && valEl) {
            valEl.textContent = `${res.d}d ${res.h}h ${res.m}m ${res.s}s`;
            
            // Dynamic Style Update
            const start = new Date(startStr), deadline = new Date(deadlineStr), now = new Date();
            const totalMs = deadline - start, remainingMs = deadline - now;
            const percent = totalMs > 0 ? (remainingMs / totalMs) : 0;
            
            if (remainingMs < 3 * 864e5) {
              pill.style.cssText = 'background: #fef2f2; color: var(--error); border: 1px solid #fee2e2;';
            } else if (percent < 0.5) {
              pill.style.cssText = 'background: #fffbeb; color: #f59e0b; border: 1px solid #fef3c7;';
            } else {
              pill.style.cssText = 'background: #f0fdf4; color: var(--success); border: 1px solid #dcfce7;';
            }
          } else if (!res && valEl && valEl.textContent !== 'OVER') {
            valEl.textContent = 'OVER';
            pill.style.cssText = 'background: #f1f5f9; color: var(--text-muted); opacity: 0.5;';
          }
        });
      }
    }, 1000); 
    
    render();
  } catch (err) {
    console.error('Critical initialization error:', err);
    // Hide overlay so user can at least see the broken state or error
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  }
});
