import { state, CATEGORIES, getCD, getCurrentMonthKey } from './state.js';

export function render() {
  const mainArea = document.getElementById('mainDisplayArea');
  if (!mainArea) return;
  mainArea.innerHTML = '';
  if (state.currentFilter === 'today') { renderTodayView(); return; }
  
  const currentKey = getCurrentMonthKey();
  const monthKeys = new Set();
  
  // Collect all unique months from delivery dates
  state.projects.forEach(p => { if (p.deliveryDate) monthKeys.add(p.deliveryDate.slice(0, 7)); });
  monthKeys.add(currentKey);
  
  Array.from(monthKeys).sort().reverse().forEach(monthKey => {
    const isCurrent = monthKey === currentKey;
    
    let filtered = state.projects.filter(p => {
      // Logic to associate projects with months
      // 1. Running projects belong to the current month
      // 2. Others belong to their delivery month
      const pMonth = p.status === 'running' ? currentKey : p.deliveryDate?.slice(0, 7);
      return pMonth === monthKey;
    });

    // Apply specific sidebar filters
    if (state.currentFilter !== 'all') {
      if (state.currentFilter === 'transferred') {
        filtered = filtered.filter(p => p.transfer === 'yes');
      } else if (state.currentFilter === 'not-transferred') {
        filtered = filtered.filter(p => p.transfer === 'no');
      } else {
        // Standard status filters (running, revision, delivered)
        filtered = filtered.filter(p => p.status === state.currentFilter);
      }
    }

    // Only render the month group if it has projects or it is the current month (for 'all' view)
    const showEmptyCurrent = isCurrent && state.currentFilter === 'all';
    if (filtered.length > 0 || showEmptyCurrent) {
      renderMonthGroup(monthKey, filtered, isCurrent);
    }
  });
  renderInsights();
  updateSidebarCounts();
}

function renderMonthGroup(monthKey, projects, isCurrent) {
  const [y, m] = monthKey.split('-');
  const dateObj = new Date(y, m-1);
  const name = dateObj.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const del = projects.filter(p => p.status !== 'running');
  const running = projects.filter(p => p.status === 'running');
  const total = del.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value)*0.8 || 0), 0);
  const workload = running.reduce((acc, p) => acc + (parseFloat(p.value) || 0), 0);
  const targets = state.appConfig.monthTargets[monthKey] || { min: 1100, team: 2000 };
  const remMin = Math.max(0, targets.min - total);

  const html = `
    <div class="month-group">
      <div class="month-header-stats">
        <h2 class="month-title">${name} ${isCurrent ? '<span style="font-size:10px; background:var(--accent); color:white; padding:4px 12px; border-radius:100px; margin-left:12px;">ACTIVE</span>' : ''}</h2>
        <div class="header-stats-row">
          <div class="h-stat-item"><span class="h-stat-label">Achieved</span><span class="h-stat-value success">$${total.toFixed(2)}</span></div>
          <div class="h-stat-item"><span class="h-stat-label">Workload</span><span class="h-stat-value" style="color:var(--accent)">$${workload.toFixed(2)}</span></div>
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
                
                // Calculate Duration and Percentage
                const start = new Date(p.start), deadline = new Date(p.deadline), now = new Date();
                const totalMs = deadline - start, remainingMs = deadline - now;
                const durationDays = Math.ceil(totalMs / 864e5);
                const percent = totalMs > 0 ? (remainingMs / totalMs) : 0;
                
                // Determine Timer Style
                let timerStyle = '';
                if (p.status === 'running') {
                  if (remainingMs < 3 * 864e5) { // Lower than 3 days
                    timerStyle = 'background: #fef2f2; color: var(--error); border: 1px solid #fee2e2;';
                  } else if (percent < 0.5) { // Less than 50%
                    timerStyle = 'background: #fffbeb; color: #f59e0b; border: 1px solid #fef3c7;';
                  } else { // Over 50%
                    timerStyle = 'background: #f0fdf4; color: var(--success); border: 1px solid #dcfce7;';
                  }
                }

                return `<tr onclick="window.openModal('${p.id}')">
                  <td><div class="project-info">
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:4px;">
                      ${cat?`<span class="p-badge" style="background:${cat.color}">${cat.label}</span>`:''}
                      ${p.todayTask ? `<span class="p-badge" style="background:#06b6d4">TODAY TASK</span>` : ''}
                      ${p.transfer === 'yes' ? `<span class="p-badge" style="background:#8b5cf6">SITE TRANSFERRED</span>` : `<span class="p-badge" style="background:var(--error)">NOT TRANSFERRED</span>`}
                      ${p.reviewed && p.reviewed!=='no'?`<span class="p-badge" style="background:#f59e0b">★ ${p.reviewed} STAR</span>`:''}
                    </div>
                    <div class="p-title">${p.name}</div><div class="p-desc">${p.notes||''}</div>
                  </div></td>
                  <td><div class="timeline-cell">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                      <span style="color:var(--success)">${p.start||'-'}</span>
                      <span style="color:var(--error)">${p.deadline?.slice(0,10)||'-'}</span>
                    </div>
                    <div style="font-size:10px; color:var(--text-muted); text-align:center; background:#f1f5f9; padding:2px; border-radius:4px;">
                      Duration: ${durationDays} Days
                    </div>
                  </div></td>
                  <td><div class="profit-cell"><span class="net-profit">$${net.toFixed(2)}</span><span class="gross-val">$${gross.toFixed(2)}</span></div></td>
                  <td>${p.status==='running'?`<div class="timer-pill" style="${timerStyle}" data-deadline="${p.deadline}" data-start="${p.start}">
                    <span class="timer-val">${cd?`${cd.d}d ${cd.h}h ${cd.m}m ${cd.s}s`:'OVER'}</span>
                  </div>`:`<div class="delivery-pill"><span class="delivery-val">${p.deliveryDate}</span></div>`}</td>
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
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  const fullName = state.appConfig.profile.name || state.appConfig.headerName || 'MANAGER';

  const html = `
    <div style="width:100%; display: flex; justify-content: center;">
      <div style="width:600px">
        <div id="todayReportBox" class="report-container">
          <div class="report-header" style="align-items: center; display: flex; justify-content: space-between;">
            <div class="report-title" style="margin: 0; flex: 1;">${fullName.toUpperCase()}</div>
            <div class="report-date" style="text-align: right; white-space: nowrap; margin-left: 20px;">${dateStr} <br/> ${timeStr.toUpperCase()}</div>
          </div>
          <div class="report-body">${filtered.map(p => {
            const shortName = p.name.split(' || ')[0];
            return `
            <div class="report-item">
              <div class="report-p-name">${shortName}</div>
              <div class="report-p-note">${p.notes||''}</div>
            </div>`;
          }).join('')}</div>
          <div class="report-footer">
            <div class="report-count">TOTAL TASKS: ${filtered.length}</div>
            <div class="report-brand">WP <span>EMPIRE</span></div>
          </div>
        </div>
        <button class="btn-add" style="width:100%; margin-top:20px" onclick="window.downloadTodayReport()">Download Report Image</button>
      </div>
    </div>`;
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
  const c = { 
    all: state.projects.length, 
    today: state.projects.filter(p => p.todayTask).length, 
    running: state.projects.filter(p => p.status === 'running').length, 
    revision: state.projects.filter(p => p.status === 'revision').length, 
    delivered: state.projects.filter(p => p.status === 'delivered').length,
    transferred: state.projects.filter(p => p.transfer === 'yes').length,
    notTransferred: state.projects.filter(p => p.transfer === 'no').length
  };
  const setVal = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setVal('filter-all', `All Projects (${c.all})`);
  setVal('filter-today', `Today Tasks (${c.today})`);
  setVal('filter-running', `Running (${c.running})`);
  setVal('filter-revision', `Revision (${c.revision})`);
  setVal('filter-delivered', `Completed (${c.delivered})`);
  setVal('filter-transferred', `Transferred (${c.transferred})`);
  setVal('filter-not-transferred', `Not Transferred (${c.notTransferred})`);
}

export async function downloadTodayReport() {
  const box = document.getElementById('todayReportBox');
  if (!box) return;
  const canvas = await html2canvas(box, { scale: 2 });
  const link = document.createElement('a');
  link.download = `Tasks_${new Date().toISOString().slice(0,10)}.png`;
  link.href = canvas.toDataURL();
  link.click();
}
