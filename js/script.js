// Configuration
const CLIENT_ID = '1030020126890-mkpj8eov6nhblo9uel0dt5d0b7sr4ehi.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata email profile';

let tokenClient, gapiInited = false, gisInited = false, driveFileId = null;
let projects = [], editId = null, selectedCats = new Set(), currentFilter = 'all';

const CATEGORIES = [
  { id: 'running', label: 'Running', color: '#3b82f6' },
  { id: 'delivered', label: 'Delivered', color: '#10b981' },
  { id: 'transferred', label: 'Transferred', color: '#0f172a' },
  { id: 'modification', label: 'Modification', color: '#8b5cf6' },
  { id: 'revision', label: 'Revision', color: '#ef4444' }
];

// Auth & Identity
function gapiLoaded() { gapi.load('client', async () => { await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }); gapiInited = true; checkReady(); }); }
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
      updateUI();
      if (token.access_token) extractEmail(token.access_token);
      syncFromCloud().finally(() => document.getElementById('loadingOverlay').style.display = 'none');
    } else { document.getElementById('loadingOverlay').style.display = 'none'; document.getElementById('loginScreen').style.display = 'flex'; }
  }
}

async function extractEmail(accessToken) {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.email) document.getElementById('userEmail').textContent = data.email;
  } catch (e) { console.error('Email fetch error', e); }
}

function updateUI() { 
  document.getElementById('loginScreen').style.display = 'none'; 
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('sidebar').style.display = 'flex';
  render(); 
}

function handleAuthClick() { tokenClient.requestAccessToken({ prompt: 'consent' }); }
function handleDisconnect() { if (confirm('Sign out?')) { localStorage.removeItem('google_token'); location.reload(); } }

// Sync UI states
function setSyncState(state) {
  const pill = document.getElementById('syncBadge');
  const txt = document.getElementById('syncText');
  if (!pill || !txt) return;
  pill.className = 'sync-pill ' + (state === 'synced' ? 'sync-synced' : '');
  txt.textContent = state.toUpperCase();
}

// Drive Sync
async function syncFromCloud() {
  try {
    const res = await gapi.client.drive.files.list({ spaces: 'appDataFolder', fields: 'files(id, name)' });
    const file = res.result.files.find(f => f.name === 'projects_data.json');
    if (file) {
      driveFileId = file.id;
      const content = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' });
      if (Array.isArray(content.result)) { projects = content.result; localStorage.setItem('p_data', JSON.stringify(projects)); render(); }
    }
    setSyncState('synced');
  } catch (e) { console.error(e); setSyncState('failed'); }
}

async function syncToCloud() {
  if (!gapi.client.getToken()) return;
  setSyncState('saving');
  try {
    const boundary = '-------314159265358979323846';
    const metadata = { name: 'projects_data.json', mimeType: 'application/json' };
    if (!driveFileId) metadata.parents = ['appDataFolder'];
    const body = ['--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata), '--' + boundary, 'Content-Type: application/json', '', JSON.stringify(projects), '--' + boundary + '--'].join('\r\n');
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
  render();
}

function render() {
  const body = document.getElementById('projectTableBody');
  if (!body) return;
  const filtered = projects.filter(p => currentFilter === 'all' || p.status === currentFilter);
  
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:80px; color:var(--text-muted); font-weight:500;">No projects found in this category.</td></tr>`;
    renderInsights(); return;
  }

  body.innerHTML = filtered.map(p => {
    const cd = getCD(p.deadline);
    const isUrgent = cd && cd.total < 864e5;
    const timerClass = !cd ? 'expired' : (isUrgent ? 'urgent' : 'active');
    const timerText = !cd ? 'TIME OVER' : `${cd.d}d ${cd.h}h ${cd.m}m ${cd.s}s`;
    
    // Profit Calculation: Use fixed share if exists, otherwise Net 80%
    const gross = parseFloat(p.value || 0);
    const myProfit = p.share ? parseFloat(p.share) : (gross * 0.8);

    const activeCat = CATEGORIES.find(c => c.id === p.status);
    const diffDays = Math.ceil(Math.abs(new Date(p.deadline) - new Date(p.start)) / 864e5);

    return `<tr>
      <td>
        <div class="project-info">
          <div style="display:flex; align-items:center; gap:8px;">
            ${activeCat ? `<span class="p-badge" style="background:${activeCat.color}">${activeCat.label}</span>` : ''}
            ${p.transfer === 'yes' ? '<span style="color:#0f172a; font-size:10px; font-weight:800;">● TRANSFERRED</span>' : ''}
          </div>
          <div class="p-title">${p.name}</div>
          <div class="p-desc">${p.notes || 'No description added.'}</div>
        </div>
      </td>
      <td>
        <div class="timeline-cell">
          <span style="color:var(--success)">${p.start || '-'}</span>
          <span style="color:var(--error)">${p.deadline?.slice(0,10) || '-'}</span>
          <span style="color:var(--accent); font-size:11px;">${diffDays} Days Total</span>
        </div>
      </td>
      <td>
        <div class="profit-cell">
          <span class="net-profit">$${myProfit.toFixed(2)}</span>
          <span class="gross-val">$${gross.toFixed(2)}</span>
          ${p.share ? `<span style="font-size:9px; color:var(--accent); font-weight:800; margin-top:2px;">FIXED SHARE</span>` : ''}
        </div>
      </td>
      <td>
        <div class="timer-pill ${timerClass}">
          <span class="timer-val">${timerText}</span>
          <span class="timer-label">Remaining Time</span>
        </div>
      </td>
      <td style="text-align:center;">
        <div style="display:flex; gap:8px; justify-content:center;">
          <button class="btn-action" onclick="openModal('${p.id}')">Edit</button>
          <button class="btn-action" style="color:var(--error);" onclick="deleteProject('${p.id}')">Del</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  renderInsights();
}

function renderInsights() {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;
  const running = projects.filter(p => p.status === 'running').length;
  const delMonth = projects.filter(p => p.status === 'delivered' && new Date(p.deadline).getMonth() === new Date().getMonth()).length;
  const profit = projects.reduce((acc, p) => acc + (p.share ? parseFloat(p.share) : (parseFloat(p.value || 0) * 0.8)), 0);
  
  panel.innerHTML = `
    <div class="stat-card"><div class="stat-title">Active Running</div><div class="stat-value">${running}</div></div>
    <div class="stat-card"><div class="stat-title">Monthly Delivered</div><div class="stat-value">${delMonth}</div></div>
    <div class="stat-card"><div class="stat-title">Lifetime Profit</div><div class="stat-value" style="color:var(--success)">$${profit.toFixed(0)}</div></div>
  `;
}

function startClock() { setInterval(() => { const now = new Date(); document.getElementById('clockTime').textContent = now.toLocaleTimeString('en-GB', { hour12: false }); document.getElementById('clockDate').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }); }, 1000); }

function toggleDeliveryFields() {
  const status = document.getElementById('fStatus').value;
  document.getElementById('deliverySection').style.display = (status === 'delivered' || status === 'transferred') ? 'block' : 'none';
}

function openModal(id = null) {
  editId = id;
  document.getElementById('modalTitle').textContent = id ? 'Modify Project' : 'New Mission';
  if (id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    document.getElementById('fName').value = p.name || '';
    document.getElementById('fStart').value = p.start || '';
    document.getElementById('fDeadline').value = p.deadline ? p.deadline.slice(0, 16) : '';
    document.getElementById('fValue').value = p.value || '';
    document.getElementById('fNotes').value = p.notes || '';
    document.getElementById('fStatus').value = p.status || 'running';
    document.getElementById('fShare').value = p.share || '';
    const radios = document.getElementsByName('fTransfer');
    radios.forEach(r => r.checked = (r.value === (p.transfer || 'no')));
  } else {
    document.getElementById('fName').value = ''; document.getElementById('fStart').value = new Date().toISOString().slice(0,10); document.getElementById('fDeadline').value = ''; document.getElementById('fValue').value = ''; document.getElementById('fNotes').value = ''; document.getElementById('fStatus').value = 'running'; document.getElementById('fShare').value = ''; document.getElementsByName('fTransfer')[0].checked = true;
  }
  toggleDeliveryFields();
  document.getElementById('modalContainer').style.display = 'block';
}

function saveProject() {
  const name = document.getElementById('fName').value.trim(), deadline = document.getElementById('fDeadline').value;
  if (!name || !deadline) return alert('Essential data missing');
  const transferVal = Array.from(document.getElementsByName('fTransfer')).find(r => r.checked)?.value || 'no';
  const data = { id: editId || Math.random().toString(36).substr(2, 9), name, start: document.getElementById('fStart').value, deadline, value: document.getElementById('fValue').value || 0, notes: document.getElementById('fNotes').value.trim(), status: document.getElementById('fStatus').value, share: document.getElementById('fShare').value, transfer: transferVal };
  if (editId) { const idx = projects.findIndex(p => p.id === editId); if (idx !== -1) projects[idx] = data; } else projects.push(data);
  save(); closeModal(); render();
}

function deleteProject(id) { if (confirm('Delete project?')) { projects = projects.filter(p => p.id !== id); save(); render(); } }
function save() { localStorage.setItem('p_data', JSON.stringify(projects)); syncToCloud(); }
function closeModal() { document.getElementById('modalContainer').style.display = 'none'; }
function handleOverlayClick(e) { if (e.target.className === 'modal-overlay') closeModal(); }

document.addEventListener('DOMContentLoaded', () => { projects = JSON.parse(localStorage.getItem('p_data') || '[]'); startClock(); setInterval(render, 1000); });
