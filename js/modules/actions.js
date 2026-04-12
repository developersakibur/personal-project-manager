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
  render();
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

let fpStart, fpDeadline, fpDelivery, fpPayment;

function initFlatpickr() {
  if (fpStart) return;
  const common = { dateFormat: "d/m/Y", allowInput: true, disableMobile: true };
  fpStart = flatpickr("#fStart", { ...common, onChange: () => { updateDeliveryBounds(); } });
  fpDeadline = flatpickr("#fDeadline", { ...common, enableTime: true, dateFormat: "d/m/Y H:i", onChange: () => { updateDeliveryBounds(); } });
  fpDelivery = flatpickr("#fDeliveryDate", { ...common, onChange: () => { window.updatePaymentMinDate(); } });
  fpPayment = flatpickr("#fPaymentDate", common);
}

export function openModal(id = null) {
  state.editId = id; 
  initFlatpickr();
  const p = id ? state.projects.find(x => x.id === id) : null;
  const title = document.getElementById('modalTitle');
  const delBtn = document.getElementById('btnDelete');
  if (title) title.textContent = id ? 'Modify Mission' : 'New Mission';
  if (delBtn) delBtn.style.display = id ? 'block' : 'none';
  
  if (p) {
    setVal('fName', p.name); 
    fpStart.setDate(p.start);
    fpDeadline.setDate(p.deadline);
    setVal('fValue', p.value); 
    setVal('fNotes', p.notes); 
    setVal('fStatus', p.status); 
    setVal('fShare', p.share); 
    setCheck('fToday', p.todayTask); 
    setVal('fReviewed', p.reviewed || 'no'); 
    fpDelivery.setDate(p.deliveryDate || '');
    
    // Set payment fields
    const payStatus = p.paymentStatus || 'due';
    document.getElementsByName('fPayment').forEach(r => r.checked = r.value === payStatus);
    fpPayment.setDate(p.paymentDate || '');
    
    // Set pill radios
    document.getElementsByName('fStatusPill').forEach(r => r.checked = r.value === p.status);
    document.getElementsByName('fTransfer').forEach(r => r.checked = r.value === p.transfer);
  } else {
    setVal('fName', ''); 
    fpStart.setDate(new Date());
    fpDeadline.setDate(null);
    setVal('fValue', ''); 
    setVal('fNotes', ''); 
    setVal('fStatus', 'running'); 
    setVal('fShare', ''); 
    setCheck('fToday', false); 
    setVal('fReviewed', 'no'); 
    fpDelivery.setDate(null);
    fpPayment.setDate(null);
    document.getElementsByName('fPayment').forEach(r => r.checked = r.value === 'due');
    
    document.getElementsByName('fStatusPill').forEach(r => r.checked = r.value === 'running');
    document.getElementsByName('fTransfer').forEach(r => r.checked = r.value === 'no');
  }
  toggleDeliveryFields();
  togglePaymentDate();
  updateDeliveryBounds();
  const modal = document.getElementById('modalContainer');
  if (modal) modal.style.display = 'block';
}

export function updateDeliveryBounds() {
  if (fpDelivery && fpStart && fpDeadline) {
    const min = fpStart.selectedDates[0];
    const max = fpDeadline.selectedDates[0];
    if (min) fpDelivery.set('minDate', min);
    if (max) fpDelivery.set('maxDate', max);
  }
}

export function togglePaymentDate() {
  const isPaid = Array.from(document.getElementsByName('fPayment')).find(r => r.checked)?.value === 'paid';
  const sec = document.getElementById('paymentDateSection');
  if (sec) sec.style.display = isPaid ? 'flex' : 'none';
  
  if (isPaid) {
    updatePaymentMinDate();
    
    // Auto-calculate +15 days if the field is empty
    if (fpPayment && !fpPayment.input.value && fpDelivery.selectedDates[0]) {
      const d = new Date(fpDelivery.selectedDates[0]);
      d.setDate(d.getDate() + 15);
      fpPayment.setDate(d);
    }
  }
}

export function updatePaymentMinDate() {
  if (fpDelivery && fpDelivery.selectedDates[0] && fpPayment) {
    const d = new Date(fpDelivery.selectedDates[0]);
    d.setDate(d.getDate() + 15);
    fpPayment.set('minDate', d);
  }
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
  const start = (fpStart && fpStart.selectedDates[0]) ? fpStart.formatDate(fpStart.selectedDates[0], "Y-m-d") : "";
  const deadline = (fpDeadline && fpDeadline.selectedDates[0]) ? fpDeadline.formatDate(fpDeadline.selectedDates[0], "Y-m-dTH:i:s") : "";
  const deliveryDate = (fpDelivery && fpDelivery.selectedDates[0]) ? fpDelivery.formatDate(fpDelivery.selectedDates[0], "Y-m-d") : "";
  const paymentDate = (fpPayment && fpPayment.selectedDates[0]) ? fpPayment.formatDate(fpPayment.selectedDates[0], "Y-m-d") : "";

  if (!name || !deadline) return alert('Data missing');
  
  const paymentStatus = Array.from(document.getElementsByName('fPayment')).find(r => r.checked)?.value || 'due';

  if (status !== 'running') {
    if (!deliveryDate) return alert('Delivery Date required');
    if (paymentStatus === 'paid') {
      if (!paymentDate) return alert('Payment Date required');
      
      const dDate = fpDelivery.selectedDates[0];
      const pDate = fpPayment.selectedDates[0];
      const diffDays = Math.floor((pDate - dDate) / 864e5);
      if (diffDays < 15) return alert('Payment Date must be at least 15 days after Delivery Date');
    }
  }
  
  // Extract ID from name (e.g., "... || FO5225EAB5885")
  const parts = name.split(' || ');
  const newId = parts.length > 1 ? parts[parts.length - 1].trim() : Math.random().toString(36).substr(2, 9);
  
  const data = { 
    id: newId, 
    name, start, deadline, value: getVal('fValue'), notes: getVal('fNotes'), status, share: getVal('fShare'), 
    transfer: Array.from(document.getElementsByName('fTransfer')).find(r => r.checked)?.value || 'no', 
    paymentStatus,
    paymentDate,
    todayTask: document.getElementById('fToday')?.checked || false, 
    reviewed: getVal('fReviewed'), deliveryDate 
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
  const revSec = document.getElementById('reviewedSection');
  if (delSec) delSec.style.display = s !== 'running' ? 'block' : 'none';
  if (revSec) revSec.style.display = s === 'delivered' ? 'block' : 'none';
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

// Private helpers
const getVal = (id) => document.getElementById(id)?.value || '';
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
