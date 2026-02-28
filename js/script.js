// Configuration
const CLIENT_ID = '1030020126890-mkpj8eov6nhblo9uel0dt5d0b7sr4ehi.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata email profile';

let tokenClient, gapiInited = false, gisInited = false, driveFileId = null;
let projects = [], editId = null, selectedCats = new Set(), currentFilter = 'all';
let appConfig = { headerName: '' };

const CATEGORIES = [
  { id: 'running', label: 'Running', color: '#3b82f6' },
  { id: 'delivered', label: 'Delivered', color: '#10b981' },
  { id: 'transferred', label: 'Transferred', color: '#0f172a' },
  { id: 'revision', label: 'Revision', color: '#ef4444' }
];

// Auth Logic
function gapiLoaded() { gapi.load('client', async () => { try { await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }); gapiInited = true; checkReady(); } catch (e) { console.error('GAPI Init Error:', e); } }); }
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID, scope: SCOPES,
    callback: async (resp) => { if (resp.error) return; localStorage.setItem('google_token', JSON.stringify(resp)); updateUI(); if (resp.access_token) extractEmail(resp.access_token); await syncFromCloud(); }
  });
  gisInited = true; checkReady();
}
function checkReady() {
  if (gapiInited && gisInited) {
    const saved = localStorage.getItem('google_token');
    if (saved) {
      const token = JSON.parse(saved);
      gapi.client.setToken(token);
      updateUI(); if (token.access_token) extractEmail(token.access_token);
      syncFromCloud().finally(() => document.getElementById('loadingOverlay').style.display = 'none');
    } else { document.getElementById('loadingOverlay').style.display = 'none'; document.getElementById('loginScreen').style.display = 'flex'; }
  }
}
async function extractEmail(accessToken) {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.email) {
      document.getElementById('userEmail').textContent = data.email;
      if (!appConfig.headerName) { appConfig.headerName = data.email.split('@')[0].toUpperCase(); localStorage.setItem('app_config', JSON.stringify(appConfig)); }
    }
  } catch (e) { console.error('Email fetch error', e); }
}
function updateUI() { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('dashboard').style.display = 'block'; document.getElementById('sidebar').style.display = 'flex'; render(); }
function handleAuthClick() { tokenClient.requestAccessToken({ prompt: 'consent' }); }
function handleDisconnect() { if (confirm('Sign out?')) { localStorage.removeItem('google_token'); location.reload(); } }

// Sync UI states
function setSyncState(state) {
  const pill = document.getElementById('syncBadge'), txt = document.getElementById('syncText');
  if (!pill || !txt) return;
  pill.className = 'sync-badge ' + (state === 'synced' ? 'sync-synced' : '');
  txt.textContent = state.toUpperCase();
}

// Drive Sync
async function syncFromCloud() {
  try {
    const res = await gapi.client.drive.files.list({ spaces: 'appDataFolder', fields: 'files(id, name)' });
    const file = res.result.files.find(f => f.name === 'projects_v2.json');
    if (file) {
      driveFileId = file.id;
      const content = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' });
      const data = content.result;
      if (data.projects) projects = data.projects;
      if (data.config) appConfig = data.config;
      localStorage.setItem('p_data', JSON.stringify(projects));
      localStorage.setItem('app_config', JSON.stringify(appConfig));
      render();
    }
    setSyncState('synced');
  } catch (e) { console.error(e); setSyncState('failed'); }
}

async function syncToCloud() {
  if (!gapi.client.getToken()) return;
  setSyncState('saving');
  try {
    const boundary = '-------314159265358979323846';
    const metadata = { name: 'projects_v2.json', mimeType: 'application/json' };
    if (!driveFileId) metadata.parents = ['appDataFolder'];
    const payload = { projects, config: appConfig };
    const body = ['--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata), '--' + boundary, 'Content-Type: application/json', '', JSON.stringify(payload), '--' + boundary + '--'].join('\r\n');
    const res = await gapi.client.request({ path: driveFileId ? `/upload/drive/v3/files/${driveFileId}` : '/upload/drive/v3/files', method: driveFileId ? 'PATCH' : 'POST', params: { uploadType: 'multipart' }, headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
    if (!driveFileId && res.result.id) driveFileId = res.result.id;
    setSyncState('synced');
  } catch (e) { setSyncState('failed'); }
}

// Logic
function getCD(deadline) {
  const diff = new Date(deadline) - new Date();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 864e5), h = Math.floor(diff % 864e5 / 36e5), m = Math.floor(diff % 36e5 / 6e4), s = Math.floor(diff % 6e4 / 1e3);
  return { d, h, m, s, total: diff };
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const title = document.getElementById('viewTitle'), subtitle = document.getElementById('viewSubtitle');
  if (f === 'today') { title.textContent = "Today's Task Sheet"; subtitle.textContent = "Capture and download your daily focus list."; }
  else { title.textContent = "Dashboard"; subtitle.textContent = "Manage your project mission control."; }
  render();
}

function render() {
  const mainArea = document.getElementById('mainDisplayArea');
  if (!mainArea) return;
  const filtered = projects.filter(p => currentFilter === 'all' ? true : (currentFilter === 'today' ? p.todayTask : p.status === currentFilter));
  
  if (currentFilter === 'today') {
    renderTodayView(filtered);
  } else {
    renderTableView(filtered);
  }
  renderInsights();
}

function renderTableView(filtered) {
  const mainArea = document.getElementById('mainDisplayArea');
  mainArea.innerHTML = `<div class="table-card"><table><thead><tr><th style="width: 40%;">Project Details</th><th style="width: 15%;">Timeline</th><th style="width: 12%;">Net Profit</th><th style="width: 240px;">Countdown</th></tr></thead><tbody id="projectTableBody"></tbody></table></div>`;
  const body = document.getElementById('projectTableBody');
  if (filtered.length === 0) { body.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:80px; color:var(--text-muted); font-weight:500;">No projects found.</td></tr>`; return; }
  body.innerHTML = filtered.map(p => {
    const cd = getCD(p.deadline), isUrgent = cd && cd.total < 864e5;
    const gross = parseFloat(p.value || 0), net = p.share ? parseFloat(p.share) : (gross * 0.8);
    const activeCat = CATEGORIES.find(c => c.id === p.status);
    const diffDays = Math.ceil(Math.abs(new Date(p.deadline) - new Date(p.start)) / 864e5);
    return `<tr onclick="openModal('${p.id}')"><td><div class="project-info"><div style="display:flex; align-items:center; gap:8px;">${activeCat ? `<span class="p-badge" style="background:${activeCat.color}">${activeCat.label}</span>` : ''}${p.transfer === 'yes' ? '<span style="color:#0f172a; font-size:10px; font-weight:800;">● TRANSFERRED</span>' : ''}${p.todayTask ? '<span style="color:var(--accent); font-size:10px; font-weight:800;">⚡ TODAY</span>' : ''}</div><div class="p-title">${p.name}</div><div class="p-desc">${p.notes || 'No description.'}</div></div></td><td><div class="timeline-cell"><span style="color:var(--success);">${p.start || '-'}</span><span style="color:var(--error);">${p.deadline?.slice(0,10) || '-'}</span><span style="color:var(--accent); font-size:11px;">${diffDays} Days Total</span></div></td><td><div class="profit-cell"><span class="net-profit">$${net.toFixed(2)}</span><span class="gross-val">$${gross.toFixed(2)}</span></div></td><td><div class="timer-pill ${!cd ? 'expired' : (isUrgent ? 'urgent' : 'active')}" data-deadline="${p.deadline}"><span class="timer-val">${!cd ? 'TIME OVER' : `${cd.d}d ${cd.h}h ${cd.m}m ${cd.s}s`}</span><span class="timer-label">Remaining Time</span></div></td></tr>`;
  }).join('');
}

function renderTodayView(filtered) {
  const mainArea = document.getElementById('mainDisplayArea');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  
  const itemsHTML = filtered.map(p => {
    const activeCat = CATEGORIES.find(c => c.id === p.status);
    const badgeHTML = activeCat ? `<span class="p-badge" style="background:${activeCat.color}; font-size:8px; padding:2px 6px;">${activeCat.label}</span>` : '';
    return `<div class="report-item"><div class="report-p-name"><div>${p.name.split('||')[0].trim()}</div><div style="margin-top:4px;">${badgeHTML}</div></div><div class="report-p-note">${p.notes || '---'}</div></div>`;
  }).join('');

  mainArea.innerHTML = `
    <div style="display: flex; flex-direction: column; width: 50%; gap: 24px;">
      <div id="todayReportBox" class="report-container" style="width: 100%;">
        <div class="report-header">
          <input type="text" id="headerEditor" class="report-title" value="${appConfig.headerName || 'PROJECT MANAGER'}" 
                 style="border:none; background:transparent; width: 60%; outline:none; font-family: inherit;" 
                 onblur="updateHeaderName(this.value)" onkeyup="if(event.key==='Enter') this.blur()"/>
          <div class="report-date">${dateStr}</div>
        </div>
        <div class="report-body">
          ${filtered.length > 0 ? itemsHTML : '<div style="text-align:center; padding:40px; color:#94a3b8;">No tasks marked for today.</div>'}
        </div>
        <div class="report-footer">
          <div class="report-count">Total Issues: ${filtered.length}</div>
          <div class="report-brand">WP <span>EMPIRE</span></div>
        </div>
      </div>
      <button class="btn-add" style="background:var(--accent); padding:16px 40px; width: 100%;" onclick="downloadTodayReport()">Download Task Sheet (PNG)</button>
    </div>`;
}

async function downloadTodayReport() {
  const box = document.getElementById('todayReportBox'), btn = event.currentTarget;
  btn.textContent = "Capturing..."; btn.disabled = true;
  
  const originalScroll = window.scrollY;
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 200));

  try {
    const canvas = await html2canvas(box, { 
      backgroundColor: "#ffffff", 
      scale: 3, 
      useCORS: true,
      logging: false,
      scrollY: 0,
      windowHeight: box.scrollHeight + 100
    });
    window.scrollTo(0, originalScroll);
    const link = document.createElement('a');
    link.download = `Tasks_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  } catch (e) { console.error(e); window.scrollTo(0, originalScroll); }
  btn.textContent = "Download Task Sheet (PNG)"; btn.disabled = false;
}

// Optimized Timer Update
function updateLiveTimers() {
  if (currentFilter === 'today') return; 
  document.querySelectorAll('.timer-pill').forEach(pill => {
    const deadline = pill.getAttribute('data-deadline');
    const cd = getCD(deadline);
    if (cd) {
      const valEl = pill.querySelector('.timer-val');
      if (valEl) valEl.textContent = `${cd.d}d ${cd.h}h ${cd.m}m ${cd.s}s`;
      if (cd.total < 864e5) pill.classList.add('urgent');
    } else {
      const valEl = pill.querySelector('.timer-val');
      if (valEl) valEl.textContent = 'TIME OVER';
      pill.classList.remove('active', 'urgent'); pill.classList.add('expired');
    }
  });
}

function updateHeaderName(val) {
  appConfig.headerName = val.trim().toUpperCase();
  localStorage.setItem('app_config', JSON.stringify(appConfig));
  syncToCloud();
}

function renderInsights() {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;
  const running = projects.filter(p => p.status === 'running').length;
  const today = projects.filter(p => p.todayTask).length;
  const profit = projects.reduce((acc, p) => acc + (p.share ? parseFloat(p.share) : (parseFloat(p.value || 0) * 0.8)), 0);
  panel.innerHTML = `<div class="stat-card"><div class="stat-title">Active Running</div><div class="stat-value">${running}</div></div><div class="stat-card"><div class="stat-title">Tasks for Today</div><div class="stat-value" style="color:var(--accent)">${today}</div></div><div class="stat-card"><div class="stat-title">Lifetime Profit</div><div class="stat-value" style="color:var(--success)">$${profit.toFixed(0)}</div></div>`;
}

function startClock() { setInterval(() => { const now = new Date(); document.getElementById('clockTime').textContent = now.toLocaleTimeString('en-GB', { hour12: false }); document.getElementById('clockDate').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }); }, 1000); }

function toggleDeliveryFields() {
  const status = document.getElementById('fStatus').value;
  document.getElementById('deliverySection').style.display = (status === 'delivered' || status === 'transferred') ? 'block' : 'none';
}

function openModal(id = null) {
  editId = id; const btnDelete = document.getElementById('btnDelete');
  document.getElementById('modalTitle').textContent = id ? 'Modify Project' : 'New Mission';
  btnDelete.style.display = id ? 'block' : 'none';
  if (id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    document.getElementById('fName').value = p.name || ''; document.getElementById('fStart').value = p.start || ''; document.getElementById('fDeadline').value = p.deadline ? p.deadline.slice(0, 16) : ''; document.getElementById('fValue').value = p.value || ''; document.getElementById('fNotes').value = p.notes || ''; document.getElementById('fStatus').value = p.status || 'running'; document.getElementById('fShare').value = p.share || ''; document.getElementById('fToday').checked = p.todayTask || false;
    const radios = document.getElementsByName('fTransfer'); radios.forEach(r => r.checked = (r.value === (p.transfer || 'no')));
  } else {
    document.getElementById('fName').value = ''; document.getElementById('fStart').value = new Date().toISOString().slice(0,10); document.getElementById('fDeadline').value = ''; document.getElementById('fValue').value = ''; document.getElementById('fNotes').value = ''; document.getElementById('fStatus').value = 'running'; document.getElementById('fShare').value = ''; document.getElementById('fToday').checked = false; document.getElementsByName('fTransfer')[0].checked = true;
  }
  toggleDeliveryFields(); document.getElementById('modalContainer').style.display = 'block';
}

function saveProject() {
  const name = document.getElementById('fName').value.trim(), deadline = document.getElementById('fDeadline').value;
  if (!name || !deadline) return alert('Data missing');
  const transferVal = Array.from(document.getElementsByName('fTransfer')).find(r => r.checked)?.value || 'no';
  const data = { id: editId || Math.random().toString(36).substr(2, 9), name, start: document.getElementById('fStart').value, deadline, value: document.getElementById('fValue').value || 0, notes: document.getElementById('fNotes').value.trim(), status: document.getElementById('fStatus').value, share: document.getElementById('fShare').value, transfer: transferVal, todayTask: document.getElementById('fToday').checked };
  if (editId) { const idx = projects.findIndex(p => p.id === editId); if (idx !== -1) projects[idx] = data; } else projects.push(data);
  save(); closeModal(); render();
}

function deleteProjectFromModal() { if (confirm('Remove permanently?')) { projects = projects.filter(p => p.id !== editId); save(); closeModal(); render(); } }
function save() { localStorage.setItem('p_data', JSON.stringify(projects)); syncToCloud(); }
function closeModal() { document.getElementById('modalContainer').style.display = 'none'; }
function handleOverlayClick(e) { if (e.target.className === 'modal-overlay') closeModal(); }

document.addEventListener('DOMContentLoaded', () => { 
  projects = JSON.parse(localStorage.getItem('p_data') || '[]'); 
  appConfig = JSON.parse(localStorage.getItem('app_config') || '{"headerName":""}');
  startClock(); setInterval(updateLiveTimers, 1000); 
});
