// SHARED STATE
const state = {
  projects: [],
  editId: null,
  currentFilter: 'all',
  isSyncing: false,
  appConfig: { headerName: '', monthTargets: {}, profile: { name: '', userId: '', teamName: '' } },
  tokenClient: null,
  gapiInited: false,
  gisInited: false,
  driveFileId: null
};

const CATEGORIES = [
  { id: 'running', label: 'Running', color: '#3b82f6' },
  { id: 'revision', label: 'Revision', color: '#ef4444' },
  { id: 'delivered', label: 'Completed', color: '#10b981' }
];

// DRIVE SYNC
async function syncFromCloud() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  try {
    const res = await gapi.client.drive.files.list({ spaces: 'appDataFolder', fields: 'files(id, name)' });
    const file = res.result.files.find(f => f.name === 'projects_v2.json');
    if (file) {
      state.driveFileId = file.id;
      const content = await gapi.client.drive.files.get({ fileId: state.driveFileId, alt: 'media' });
      const data = content.result;
      if (data.projects) state.projects = data.projects;
      if (data.config) state.appConfig = data.config;
      localStorage.setItem('p_data', JSON.stringify(state.projects));
      localStorage.setItem('app_config', JSON.stringify(state.appConfig));
      render();
    }
    setSyncUI('synced');
  } catch (e) { console.error('Sync Error:', e); setSyncUI('failed'); }
  finally { state.isSyncing = false; }
}

async function syncToCloud() {
  if (!gapi.client.getToken()) return;
  setSyncUI('saving');
  try {
    const boundary = '-------314159265358979323846';
    const metadata = { name: 'projects_v2.json', mimeType: 'application/json' };
    if (!state.driveFileId) metadata.parents = ['appDataFolder'];
    const payload = { projects: state.projects, config: state.appConfig };
    const body = ['--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata), '--' + boundary, 'Content-Type: application/json', '', JSON.stringify(payload), '--' + boundary + '--'].join('\r\n');
    const res = await gapi.client.request({ path: state.driveFileId ? `/upload/drive/v3/files/${state.driveFileId}` : '/upload/drive/v3/files', method: state.driveFileId ? 'PATCH' : 'POST', params: { uploadType: 'multipart' }, headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
    if (!state.driveFileId && res.result.id) state.driveFileId = res.result.id;
    setSyncUI('synced');
  } catch (e) { setSyncUI('failed'); }
}

function setSyncUI(status) {
  const pill = document.getElementById('syncBadge'), txt = document.getElementById('syncText');
  if (pill && txt) {
    pill.className = 'sync-badge ' + (status === 'synced' ? 'sync-synced' : '');
    txt.textContent = status.toUpperCase();
  }
}

// AUTH
const CLIENT_ID = '1030020126890-mkpj8eov6nhblo9uel0dt5d0b7sr4ehi.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata email profile';

window.gapiLoaded = () => { 
  gapi.load('client', async () => { 
    try {
      await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }); 
      state.gapiInited = true; 
      startupCheck(); 
    } catch (e) { console.error('GAPI Init Error', e); hideOverlay(); }
  }); 
};

window.gisLoaded = () => {
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID, scope: SCOPES,
    callback: async (resp) => { 
      if (resp.error) return; 
      localStorage.setItem('google_token', JSON.stringify(resp)); 
      gapi.client.setToken(resp);
      if (resp.access_token) fetchProfile(resp.access_token);
      await syncFromCloud();
      showApp();
    }
  });
  state.gisInited = true; 
  startupCheck();
};

async function startupCheck() {
  if (state.gapiInited && state.gisInited) {
    const saved = localStorage.getItem('google_token');
    if (saved) {
      const token = JSON.parse(saved);
      gapi.client.setToken(token);
      if (token.access_token) fetchProfile(token.access_token);
      showApp();
      await syncFromCloud();
      hideOverlay();
    } else { 
      hideOverlay();
      document.getElementById('loginScreen').style.display = 'flex'; 
    }
  }
}

function hideOverlay() { 
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none'; 
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('sidebar').style.display = 'flex';
  render();
}

async function fetchProfile(token) {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (data.email) {
      document.getElementById('userEmail').textContent = data.email;
      if (document.getElementById('pGoogleEmail')) document.getElementById('pGoogleEmail').textContent = data.email;
    }
  } catch (e) {}
}

window.handleAuthClick = () => state.tokenClient.requestAccessToken({ prompt: 'consent' });
window.handleDisconnect = () => { if (confirm('Sign out?')) { localStorage.removeItem('google_token'); location.reload(); } };

// UTILS & RENDERING
function getCD(deadline) {
  const diff = new Date(deadline) - new Date();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 864e5), h = Math.floor(diff % 864e5 / 36e5), m = Math.floor(diff % 36e5 / 6e4), s = Math.floor(diff % 6e4 / 1e3);
  return { d, h, m, s, total: diff };
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

window.render = () => {
  const mainArea = document.getElementById('mainDisplayArea');
  if (!mainArea) return;
  mainArea.innerHTML = '';
  if (state.currentFilter === 'today') { renderTodayView(); return; }
  
  const currentKey = getCurrentMonthKey();
  const monthKeys = new Set([currentKey]);
  state.projects.forEach(p => { if (p.deliveryDate) monthKeys.add(p.deliveryDate.slice(0, 7)); });
  
  Array.from(monthKeys).sort().reverse().forEach(monthKey => {
    const isCurrent = monthKey === currentKey;
    let filtered = state.projects.filter(p => p.status === 'running' ? isCurrent : (p.deliveryDate?.startsWith(monthKey)));
    if (state.currentFilter !== 'all') filtered = filtered.filter(p => p.status === state.currentFilter);
    if (filtered.length > 0 || isCurrent) renderMonthGroup(monthKey, filtered, isCurrent);
  });
  renderInsights();
  updateSidebarCounts();
};

function renderMonthGroup(monthKey, projects, isCurrent) {
  const [y, m] = monthKey.split('-');
  const name = new Date(y, m-1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const del = projects.filter(p => p.status !== 'running');
  const total = del.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value)*0.8 || 0), 0);
  const targets = state.appConfig.monthTargets[monthKey] || { min: 1100, team: 2000 };
  const remMin = Math.max(0, targets.min - total);

  const html = `
    <div class="month-group">
      <div class="month-header-stats">
        <h2 class="month-title">${name} ${isCurrent ? '<span style="font-size:10px; background:var(--accent); color:white; padding:4px 12px; border-radius:100px; margin-left:12px;">ACTIVE</span>' : ''}</h2>
        <div class="header-stats-row">
          <div class="h-stat-item"><span class="h-stat-label">Achieved</span><span class="h-stat-value success">$${total.toFixed(2)}</span></div>
          <div class="h-stat-item"><span class="h-stat-label">Min Target</span><span class="h-stat-value">$${targets.min}</span></div>
          <div class="h-stat-item"><span class="h-stat-label">To Min</span><span class="h-stat-value ${remMin>0?'error':'success'}">$${remMin.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th style="width:40%">Project</th><th style="width:15%">Timeline</th><th style="width:12%">Profit</th><th style="width:240px">Status</th></tr></thead>
          <tbody>
            ${projects.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--text-muted);">No projects.</td></tr>' : 
              projects.map(p => {
                const cd = getCD(p.deadline), gross = parseFloat(p.value||0), net = parseFloat(p.share) || gross*0.8;
                const cat = CATEGORIES.find(c => c.id === p.status);
                return `<tr onclick="window.openModal('${p.id}')">
                  <td><div class="project-info">
                    <div style="display:flex; gap:8px;">${cat?`<span class="p-badge" style="background:${cat.color}">${cat.label}</span>`:''}${p.reviewed && p.reviewed!=='no'?`<span style="color:orange; font-size:10px; font-weight:800;">★ ${p.reviewed}</span>`:''}</div>
                    <div class="p-title">${p.name}</div><div class="p-desc">${p.notes||''}</div>
                  </div></td>
                  <td><div class="timeline-cell"><span style="color:var(--success)">${p.start||'-'}</span><span style="color:var(--error)">${p.deadline?.slice(0,10)||'-'}</span></div></td>
                  <td><div class="profit-cell"><span class="net-profit">$${net.toFixed(2)}</span><span class="gross-val">$${gross.toFixed(2)}</span></div></td>
                  <td>${p.status==='running'?`<div class="timer-pill ${cd?.total<864e5?'urgent':'active'}" data-deadline="${p.deadline}"><span class="timer-val">${cd?`${cd.d}d ${cd.h}h ${cd.m}m`:'OVER'}</span></div>`:`<div class="delivery-pill"><span class="delivery-val">${p.deliveryDate}</span></div>`}</td>
                </tr>`
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  document.getElementById('mainDisplayArea').insertAdjacentHTML('beforeend', html);
}

function renderTodayView() {
  const filtered = state.projects.filter(p => p.todayTask);
  const now = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const html = `
    <div style="width:50%"><div id="todayReportBox" class="report-container">
      <div class="report-header"><input type="text" class="report-title" value="${state.appConfig.headerName||'MANAGER'}" onblur="window.updateHeaderName(this.value)" style="border:none; outline:none; width:60%"/><div class="report-date">${now}</div></div>
      <div class="report-body">${filtered.map(p => `<div class="report-item"><div class="report-p-name">${p.name}</div><div class="report-p-note">${p.notes||''}</div></div>`).join('')}</div>
      <div class="report-footer"><div class="report-count">Total: ${filtered.length}</div><div class="report-brand">WP <span>EMPIRE</span></div></div>
    </div><button class="btn-add" style="width:100%; margin-top:20px" onclick="window.downloadTodayReport()">Download PNG</button></div>`;
  document.getElementById('mainDisplayArea').innerHTML = html;
}

function renderInsights() {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;
  const running = state.projects.filter(p => p.status === 'running').length;
  const profit = state.projects.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value)*0.8 || 0), 0);
  panel.innerHTML = `<div class="stat-card"><div class="stat-title">Running</div><div class="stat-value">${running}</div></div><div class="stat-card"><div class="stat-title">Lifetime Profit</div><div class="stat-value" style="color:var(--success)">$${profit.toFixed(0)}</div></div>`;
}

function updateSidebarCounts() {
  const c = { all: state.projects.length, today: state.projects.filter(p => p.todayTask).length, running: state.projects.filter(p => p.status === 'running').length, revision: state.projects.filter(p => p.status === 'revision').length, delivered: state.projects.filter(p => p.status === 'delivered').length };
  document.getElementById('filter-all').textContent = `All Projects (${c.all})`;
  document.getElementById('filter-today').textContent = `Today (${c.today})`;
  document.getElementById('filter-running').textContent = `Running (${c.running})`;
  document.getElementById('filter-revision').textContent = `Revision (${c.revision})`;
  document.getElementById('filter-delivered').textContent = `Completed (${c.delivered})`;
}

// NAVIGATION & PROFILE
window.setFilter = (f, btn) => {
  state.currentFilter = f;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const isAcc = f === 'account';
  document.getElementById('dashboard').style.display = isAcc ? 'none' : 'block';
  document.getElementById('accountView').style.display = isAcc ? 'block' : 'none';
  if (isAcc) renderAccount(); else render();
};

function renderAccount() {
  const p = state.appConfig.profile, key = getCurrentMonthKey(), t = state.appConfig.monthTargets[key] || { min: 1100, team: 2000 };
  document.getElementById('pName').value = p.name || ''; document.getElementById('pUserId').value = p.userId || ''; document.getElementById('pTeamName').value = p.teamName || ''; document.getElementById('pMinTarget').value = t.min; document.getElementById('pTeamTarget').value = t.team;
}

window.saveProfile = () => {
  state.appConfig.profile = { name: document.getElementById('pName').value, userId: document.getElementById('pUserId').value, teamName: document.getElementById('pTeamName').value };
  const key = getCurrentMonthKey(); if (!state.appConfig.monthTargets[key]) state.appConfig.monthTargets[key] = { min: 1100, team: 2000 };
  state.appConfig.monthTargets[key].min = parseFloat(document.getElementById('pMinTarget').value); state.appConfig.monthTargets[key].team = parseFloat(document.getElementById('pTeamTarget').value);
  localStorage.setItem('app_config', JSON.stringify(state.appConfig)); syncToCloud();
};

window.updateHeaderName = (v) => { state.appConfig.headerName = v.toUpperCase(); localStorage.setItem('app_config', JSON.stringify(state.appConfig)); syncToCloud(); };

// MODAL
window.openModal = (id = null) => {
  state.editId = id; const p = id ? state.projects.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = id ? 'Modify Project' : 'New Mission';
  document.getElementById('btnDelete').style.display = id ? 'block' : 'none';
  if (p) {
    document.getElementById('fName').value = p.name; document.getElementById('fStart').value = p.start; document.getElementById('fDeadline').value = p.deadline.slice(0,16); document.getElementById('fValue').value = p.value; document.getElementById('fNotes').value = p.notes; document.getElementById('fStatus').value = p.status; document.getElementById('fShare').value = p.share; document.getElementById('fToday').checked = p.todayTask; document.getElementById('fReviewed').value = p.reviewed || 'no'; document.getElementById('fDeliveryDate').value = p.deliveryDate || '';
    document.getElementsByName('fTransfer').forEach(r => r.checked = r.value === p.transfer);
  } else {
    document.getElementById('fName').value = ''; document.getElementById('fStart').value = new Date().toISOString().slice(0,10); document.getElementById('fDeadline').value = ''; document.getElementById('fValue').value = ''; document.getElementById('fNotes').value = ''; document.getElementById('fStatus').value = 'running'; document.getElementById('fShare').value = ''; document.getElementById('fToday').checked = false; document.getElementById('fReviewed').value = 'no'; document.getElementById('fDeliveryDate').value = ''; document.getElementsByName('fTransfer')[0].checked = true;
  }
  window.toggleDeliveryFields(); document.getElementById('modalContainer').style.display = 'block';
};

window.saveProject = () => {
  const status = document.getElementById('fStatus').value, deliveryDate = document.getElementById('fDeliveryDate').value;
  if (!document.getElementById('fName').value || !document.getElementById('fDeadline').value) return alert('Data missing');
  if (status !== 'running' && !deliveryDate) return alert('Delivery Date required');
  const data = { id: state.editId || Math.random().toString(36).substr(2, 9), name: document.getElementById('fName').value, start: document.getElementById('fStart').value, deadline: document.getElementById('fDeadline').value, value: document.getElementById('fValue').value, notes: document.getElementById('fNotes').value, status, share: document.getElementById('fShare').value, transfer: Array.from(document.getElementsByName('fTransfer')).find(r => r.checked).value, todayTask: document.getElementById('fToday').checked, reviewed: document.getElementById('fReviewed').value, deliveryDate };
  if (state.editId) state.projects[state.projects.findIndex(p => p.id === state.editId)] = data; else state.projects.push(data);
  localStorage.setItem('p_data', JSON.stringify(state.projects)); syncToCloud(); window.closeModal(); render();
};

window.closeModal = () => document.getElementById('modalContainer').style.display = 'none';
window.deleteProjectFromModal = () => { if (confirm('Delete?')) { state.projects = state.projects.filter(p => p.id !== state.editId); localStorage.setItem('p_data', JSON.stringify(state.projects)); syncToCloud(); window.closeModal(); render(); } };
window.handleOverlayClick = (e) => { if (e.target.className === 'modal-overlay') window.closeModal(); };
window.toggleDeliveryFields = () => {
  const s = document.getElementById('fStatus').value;
  document.getElementById('deliverySection').style.display = s!=='running' ? 'block' : 'none';
  document.getElementById('reviewedSection').style.display = s==='delivered' ? 'block' : 'none';
};

window.downloadTodayReport = async () => {
  const box = document.getElementById('todayReportBox');
  const canvas = await html2canvas(box, { scale: 2 });
  const link = document.createElement('a');
  link.download = `Tasks_${new Date().toISOString().slice(0,10)}.png`;
  link.href = canvas.toDataURL();
  link.click();
};

// INIT
document.addEventListener('DOMContentLoaded', () => { 
  state.projects = JSON.parse(localStorage.getItem('p_data') || '[]'); 
  state.appConfig = JSON.parse(localStorage.getItem('app_config') || '{"headerName":"","monthTargets":{}, "profile": {"name":"", "userId":"", "teamName":""}}');
  
  setInterval(() => { 
    const now = new Date();
    const ct = document.getElementById('clockTime'), cd = document.getElementById('clockDate');
    if (ct) ct.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    if (cd) cd.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    
    if (state.currentFilter !== 'today' && state.currentFilter !== 'account') {
      document.querySelectorAll('.timer-pill').forEach(pill => {
        const res = getCD(pill.getAttribute('data-deadline'));
        if (res) pill.querySelector('.timer-val').textContent = `${res.d}d ${res.h}h ${res.m}m`;
      });
    }
  }, 1000); 
});
