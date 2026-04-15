import { state, getCurrentMonthKey } from './state.js';
import { syncToCloud } from './drive.js';
import { render } from './ui.js';

export function setFilter(f, btn) {
  state.currentFilter = f;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  render();
}

export function handleSearch(query) {
  state.searchQuery = query.trim().toLowerCase();
  const clearBtn = document.getElementById('clearSearch');
  if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';
  render();
}

export function clearSearch() {
  const input = document.getElementById('sidebarSearch');
  if (input) {
    input.value = '';
    handleSearch('');
    input.focus();
  }
}

export function setQuarter(val) {
  const [year, qIdx] = val.split('-').map(Number);
  state.selectedQuarter = { year, qIdx };
  render();
}

export function setTargetQuarter(val) {
  state.targetQuarter = val;
  render();
}

export function openModal(id = null) {
  state.editId = id; 
  const p = id ? state.projects.find(x => x.id === id) : null;
  const title = document.getElementById('modalTitle');
  const delBtn = document.getElementById('btnDelete');
  if (title) title.textContent = id ? 'Modify Mission' : 'New Mission';
  if (delBtn) delBtn.style.display = id ? 'block' : 'none';
  
  if (p) {
    setVal('fName', p.name); 
    setVal('field_start_date', p.start);
    setVal('field_deadline_date', p.deadline ? p.deadline.slice(0, 16) : '');
    setVal('fValue', p.value); 
    setVal('fNotes', p.notes); 
    setVal('fStatus', p.status); 
    setVal('fShare', p.share); 
    setCheck('fToday', p.todayTask); 
    setVal('field_delivery_date', p.deliveryDate || '');
    setVal('field_paid_date', p.paymentDate || '');
    
    // Set pill radios
    document.getElementsByName('fStatusPill').forEach(r => r.checked = r.value === p.status);
    document.getElementsByName('fTransfer').forEach(r => r.checked = r.value === p.transfer);
    document.getElementsByName('fRatingPill').forEach(r => r.checked = r.value === (p.reviewed || '0'));
  } else {
    setVal('fName', ''); 
    setVal('field_start_date', new Date().toISOString().slice(0, 10));
    setVal('field_deadline_date', '');
    setVal('fValue', ''); 
    setVal('fNotes', ''); 
    setVal('fStatus', 'running'); 
    setVal('fShare', ''); 
    setCheck('fToday', false); 
    setVal('field_delivery_date', '');
    setVal('field_paid_date', '');
    
    document.getElementsByName('fStatusPill').forEach(r => r.checked = r.value === 'running');
    document.getElementsByName('fTransfer').forEach(r => r.checked = r.value === 'no');
    document.getElementsByName('fRatingPill').forEach(r => r.checked = r.value === '0');
  }
  toggleDeliveryFields();
  togglePaymentDate();
  updateDeliveryBounds();
  const modal = document.getElementById('modalContainer');
  if (modal) modal.style.display = 'block';
}

export function updateDeliveryBounds() {
  const startVal = getVal('field_start_date');
  const deadlineVal = getVal('field_deadline_date');
  const deliveryInput = document.getElementById('field_delivery_date');
  
  if (deliveryInput) {
    if (startVal) deliveryInput.setAttribute('min', startVal);
    if (deadlineVal) deliveryInput.setAttribute('max', deadlineVal.slice(0, 10));
  }
}

export function togglePaymentDate() {
  updatePaymentBounds();
  
  // Auto-calculate +20 days if the field is empty
  const payDateInput = document.getElementById('field_paid_date');
  const deliveryDateVal = getVal('field_delivery_date');
  if (payDateInput && !payDateInput.value && deliveryDateVal) {
    const d = new Date(deliveryDateVal);
    d.setDate(d.getDate() + 20);
    payDateInput.value = d.toISOString().split('T')[0];
  }
}

export function updatePaymentBounds() {
  const deliveryDateVal = getVal('field_delivery_date');
  const paymentDateInput = document.getElementById('field_paid_date');
  if (deliveryDateVal && paymentDateInput) {
    const d = new Date(deliveryDateVal);
    d.setDate(d.getDate() + 20);
    const dateStr = d.toISOString().split('T')[0];
    paymentDateInput.setAttribute('min', dateStr);
    paymentDateInput.setAttribute('max', dateStr);
  }
}

export function updatePaymentMinDate() {
  updatePaymentBounds();
}

export function syncStatusSelect(val) {
  const select = document.getElementById('fStatus');
  if (select) {
    select.value = val;
    toggleDeliveryFields();
  }
}

export function saveProject() {
  const name = getVal('fName'), status = getVal('fStatus');
  const start = getVal('field_start_date');
  const deadline = getVal('field_deadline_date');
  const deliveryDate = getVal('field_delivery_date');
  const paymentDate = getVal('field_paid_date');

  if (!name || !deadline) return alert('Data missing');
  
  if (status !== 'running') {
    if (!deliveryDate) return alert('Delivery Date required');
    if (!paymentDate) return alert('Payment Date required');
    
    const dDate = new Date(deliveryDate);
    const pDate = new Date(paymentDate);
    const diffDays = Math.floor((pDate - dDate) / 864e5);
    if (diffDays !== 20) return alert('Payment Date must be exactly 20 days after Delivery Date');
  }
  
  // Extract ID from name (e.g., "... || FO5225EAB5885")
  const parts = name.split(' || ');
  const newId = parts.length > 1 ? parts[parts.length - 1].trim() : Math.random().toString(36).substr(2, 9);
  
  const data = { 
    id: newId, 
    name, start, deadline, value: getVal('fValue'), notes: getVal('fNotes'), status, share: getVal('fShare'), 
    transfer: Array.from(document.getElementsByName('fTransfer')).find(r => r.checked)?.value || 'no', 
    paymentDate,
    todayTask: document.getElementById('fToday')?.checked || false, 
    reviewed: Array.from(document.getElementsByName('fRatingPill')).find(r => r.checked)?.value || '0', 
    deliveryDate 
  };
  
  if (state.editId) {
    // If ID changed, check for conflicts with OTHER projects
    const duplicate = state.projects.find(p => p.id === newId && p.id !== state.editId);
    if (duplicate) return alert(`Conflict: The ID "${newId}" is already used by another project: "${duplicate.name}"`);

    const idx = state.projects.findIndex(p => p.id === state.editId);
    if (idx !== -1) state.projects[idx] = data;
  } else {
    // New project: check for conflicts
    const exists = state.projects.find(p => p.id === newId);
    if (exists) return alert(`Conflict: A project with ID "${newId}" already exists: "${exists.name}"`);
    state.projects.push(data);
  }
  
  localStorage.setItem('p_data', JSON.stringify(state.projects)); 
  syncToCloud(); 
  closeModal(); 
  render();
}

/**
 * Repairs existing data conflicts by ensuring all IDs match their name parts
 * and are globally unique within the array.
 */
export function sanitizeData() {
  let changed = false;
  const seenIds = new Set();
  
  // 1. Sanitize Project IDs
  state.projects = state.projects.map(p => {
    const parts = p.name.split(' || ');
    let currentId = parts.length > 1 ? parts[parts.length - 1].trim() : p.id;
    
    if (seenIds.has(currentId)) {
      currentId = `${currentId}_${Math.random().toString(36).substr(2, 4)}`;
      changed = true;
    }
    
    seenIds.add(currentId);
    if (p.id !== currentId) {
      p.id = currentId;
      changed = true;
    }
    return p;
  });

  if (changed) {
    localStorage.setItem('p_data', JSON.stringify(state.projects));
    localStorage.setItem('app_config', JSON.stringify(state.appConfig));
    syncToCloud();
  }
}

export function deleteProjectFromModal() { 
  if (confirm('Delete?')) { 
    state.projects = state.projects.filter(p => p.id !== state.editId); 
    localStorage.setItem('p_data', JSON.stringify(state.projects)); 
    syncToCloud(); 
    closeModal(); 
    render(); 
  } 
}

export function closeModal() { 
  const modal = document.getElementById('modalContainer');
  if (modal) modal.style.display = 'none'; 
}

export function toggleDeliveryFields() {
  const s = getVal('fStatus');
  const delSec = document.getElementById('deliverySection');
  if (delSec) delSec.style.display = s !== 'running' ? 'block' : 'none';
}

export function renderAccount() {
  const p = state.appConfig.profile, now = new Date();
  const qKey = state.targetQuarter || `${now.getFullYear()}-${Math.floor(now.getMonth() / 3)}`;
  const qCfg = state.appConfig.quarterConfigs?.[qKey] || { min: 3300, preCarry: 0, newCarry: 0 };

  setVal('pName', p.name || ''); 
  setVal('pUserId', p.userId || ''); 
  setVal('pTeamName', p.teamName || ''); 
  setVal('pMinTarget', qCfg.min); 
  setVal('pPreCarry', qCfg.preCarry);
  setVal('pNewCarry', qCfg.newCarry);
}

export function saveProfile() {
  state.appConfig.profile = { 
    name: getVal('pName'), 
    userId: getVal('pUserId'), 
    teamName: getVal('pTeamName')
  };
  
  const now = new Date();
  const qKey = state.targetQuarter || `${now.getFullYear()}-${Math.floor(now.getMonth() / 3)}`;
  
  if (!state.appConfig.quarterConfigs) state.appConfig.quarterConfigs = {};
  state.appConfig.quarterConfigs[qKey] = {
    min: parseFloat(getVal('pMinTarget')) || 0,
    preCarry: parseFloat(getVal('pPreCarry')) || 0,
    newCarry: parseFloat(getVal('pNewCarry')) || 0
  };

  localStorage.setItem('app_config', JSON.stringify(state.appConfig)); 
  syncToCloud();
  render(); 
}

export function updateHeaderName(v) { 
  state.appConfig.headerName = v.toUpperCase(); 
  localStorage.setItem('app_config', JSON.stringify(state.appConfig)); 
  syncToCloud(); 
}

export function exportData() {
  const data = { projects: state.projects, config: state.appConfig };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `project_manager_backup_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.projects || !data.config) {
        throw new Error('Invalid backup file format');
      }

      if (confirm('Importing will overwrite your current data. Continue?')) {
        state.projects = data.projects;
        state.appConfig = data.config;
        
        localStorage.setItem('p_data', JSON.stringify(state.projects));
        localStorage.setItem('app_config', JSON.stringify(state.appConfig));
        
        syncToCloud();
        render();
        alert('Data imported successfully!');
      }
    } catch (err) {
      console.error('Import Error:', err);
      alert('Failed to import data: ' + err.message);
    }
  };
  reader.readAsText(file);
}

export function eraseAllData() {
  if (confirm('CRITICAL ACTION: This will permanently delete ALL projects and reset your settings. This cannot be undone unless you have a backup. Continue?')) {
    if (confirm('Are you ABSOLUTELY sure? All data will be wiped from this device and the cloud.')) {
      state.projects = [];
      state.appConfig = { headerName: '', quarterConfigs: {}, profile: { name: '', userId: '', teamName: '' } };
      
      localStorage.setItem('p_data', JSON.stringify(state.projects));
      localStorage.setItem('app_config', JSON.stringify(state.appConfig));
      
      syncToCloud();
      render();
      renderAccount();
      alert('All data has been erased.');
    }
  }
}

export function toggleSort(monthKey, col) {
  if (!state.monthSorts[monthKey]) {
    state.monthSorts[monthKey] = { col: 'deadline', dir: 'asc' };
  }
  
  const s = state.monthSorts[monthKey];
  if (s.col === col) {
    s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  } else {
    s.col = col;
    s.dir = 'asc';
  }
  render();
}

export function toggleListView() {
  state.listView = document.getElementById('fListView')?.checked || false;
  render();
}

// Private helpers
const getVal = (id) => document.getElementById(id)?.value || '';
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
