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
        filtered = filtered.filter(p => p.status === state.currentFilter);
      }
    }

    const showEmptyCurrent = isCurrent && state.currentFilter === 'all';
    if (filtered.length > 0 || showEmptyCurrent) {
      renderMonthGroup(monthKey, filtered, isCurrent);
    }
  });
  renderInsights();
  updateSidebarCounts();
}

function getSortIndicator(monthKey, col) {
  const s = state.monthSorts[monthKey] || { col: 'deadline', dir: 'asc' };
  if (s.col !== col) return '<span style="opacity:0.2; margin-left:4px;">↕</span>';
  return `<span style="color:var(--accent); margin-left:4px; font-weight:800;">${s.dir === 'asc' ? '↑' : '↓'}</span>`;
}

function renderMonthGroup(monthKey, projects, isCurrent) {
  const [y, m] = monthKey.split('-');
  const dateObj = new Date(y, m-1);
  const name = dateObj.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  
  // Apply Independent Sorting for THIS month
  const sort = state.monthSorts[monthKey] || { col: 'deadline', dir: 'asc' };
  const sortedProjects = [...projects].sort((a, b) => {
    let valA, valB;
    switch (sort.col) {
      case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
      case 'start': valA = a.start || ''; valB = b.start || ''; break;
      case 'deadline': valA = a.deadline || ''; valB = b.deadline || ''; break;
      case 'duration': 
        valA = (new Date(a.deadline) - new Date(a.start)) || 0;
        valB = (new Date(b.deadline) - new Date(b.start)) || 0;
        break;
      case 'gross': valA = parseFloat(a.value || 0); valB = parseFloat(b.value || 0); break;
      case 'profit': 
        valA = parseFloat(a.share) || parseFloat(a.value || 0) * 0.8;
        valB = parseFloat(b.share) || parseFloat(b.value || 0) * 0.8;
        break;
      case 'status': valA = a.status; valB = b.status; break;
      default: valA = a.deadline || ''; valB = b.deadline || '';
    }
    if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const del = sortedProjects.filter(p => p.status !== 'running');
  const running = sortedProjects.filter(p => p.status === 'running');
  
  const achieved = del.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0), 0);
  const workload = running.reduce((acc, p) => acc + ((parseFloat(p.value) || 0) * 0.8), 0);
  const targets = state.appConfig.monthTargets[monthKey] || { min: 1100, team: 2000 };
  
  const revenueUSD = achieved - targets.min;
  const revenueBDT = revenueUSD * 5;

  const html = `
    <div class="month-group">
      <div class="month-header-stats">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${isCurrent ? '<div style="width: 3px; height: 18px; background: var(--accent); border-radius: 100px;"></div>' : ''}
          <h2 class="month-title">${name.toUpperCase()}</h2>
        </div>
        
        <div class="header-stats-row">
          <div class="h-stat-item">
            <span class="h-stat-label">Minimum</span>
            <span class="h-stat-value">$${targets.min}</span>
          </div>
          <div class="h-stat-item">
            <span class="h-stat-label">Achieved</span>
            <span class="h-stat-value success">$${achieved.toFixed(0)}</span>
          </div>
          <div class="h-stat-item">
            <span class="h-stat-label">In Hand</span>
            <span class="h-stat-value" style="color:var(--accent)">$${workload.toFixed(0)}</span>
          </div>
          <div class="h-stat-item">
            <span class="h-stat-label">Revenue</span>
            <span class="h-stat-value" style="color:${revenueUSD >= 0 ? 'var(--success)' : 'var(--error)'}">$${revenueUSD.toFixed(0)}</span>
          </div>
          <div class="h-stat-item">
             <span class="h-stat-label">Net BDT</span>
             <span class="h-stat-value" style="color:${revenueBDT >= 0 ? 'var(--primary)' : 'var(--error)'}">৳${revenueBDT.toFixed(0)}</span>
          </div>
        </div>
      </div>
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th style="width:30%; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'name')">
                Project Name / Mission ${getSortIndicator(monthKey, 'name')}
              </th>
              <th style="width:10%; text-align: center; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'start')">
                Start ${getSortIndicator(monthKey, 'start')}
              </th>
              <th style="width:10%; text-align: center; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'deadline')">
                Deadline ${getSortIndicator(monthKey, 'deadline')}
              </th>
              <th style="width:10%; text-align: center; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'duration')">
                Duration ${getSortIndicator(monthKey, 'duration')}
              </th>
              <th style="width:10%; text-align: center; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'gross')">
                Gross ${getSortIndicator(monthKey, 'gross')}
              </th>
              <th style="width:10%; text-align: center; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'profit')">
                Profit ${getSortIndicator(monthKey, 'profit')}
              </th>
              <th style="width:20%; cursor:pointer;" onclick="window.toggleSort('${monthKey}', 'status')">
                Status / Tracking ${getSortIndicator(monthKey, 'status')}
              </th>
            </tr>
          </thead>
          <tbody>
            ${sortedProjects.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">No projects recorded for this period.</td></tr>' : 
              sortedProjects.map(p => {
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
                    timerStyle = 'background: #fef2f2; color: var(--error); border-color: #fecaca;';
                  } else if (percent < 0.5) { // Less than 50%
                    timerStyle = 'background: #fffbeb; color: var(--warning); border-color: #fde68a;';
                  } else { // Over 50%
                    timerStyle = 'background: #f0fdf4; color: var(--success); border-color: #bbf7d0;';
                  }
                }

                return `<tr onclick="window.openModal('${p.id}')">
                  <td><div class="project-info">
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
                      ${cat?`<span class="p-badge" style="color:${cat.color}; border-color:${cat.color}20; background:${cat.color}10">${cat.label}</span>`:''}
                      ${p.todayTask ? `<span class="p-badge" style="color:#0891b2; border-color:#0891b220; background:#0891b210">TODAY</span>` : ''}
                      ${p.transfer === 'yes' ? `<span class="p-badge" style="color:#7c3aed; border-color:#7c3aed20; background:#7c3aed10">TRANSFERRED</span>` : `<span class="p-badge" style="color:var(--error); border-color:var(--error)20; background:var(--error)10">NOT TRANSFERRED</span>`}
                      ${p.reviewed && p.reviewed!=='no'?`<span class="p-badge" style="color:var(--warning); border-color:var(--warning)20; background:var(--warning)10">★ ${p.reviewed}</span>`:''}
                    </div>
                    <div class="p-title">${p.name}</div>
                    ${p.todayTask ? `<div class="p-desc">${p.notes||''}</div>` : ''}
                  </div></td>
                  <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${p.start||'-'}</td>
                  <td style="text-align: center; color: var(--primary); font-weight: 700;">${p.deadline?.slice(0,10)||'-'}</td>
                  <td style="text-align: center;">
                    <span style="font-size:11px; color:var(--text-muted); font-weight:700; background: var(--bg); padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">
                      ${durationDays} Days
                    </span>
                  </td>
                  <td style="text-align: center; color: var(--text-muted); font-weight: 600; font-size: 13px;">$${gross.toFixed(0)}</td>
                  <td style="text-align: center; color: var(--primary); font-weight: 800; font-size: 15px;">$${net.toFixed(0)}</td>
                  <td style="padding-right: 24px;">${p.status==='running'?`<div class="timer-pill" style="${timerStyle}" data-deadline="${p.deadline}" data-start="${p.start}">
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
  
  // Calculate Stats
  const todayISO = now.toISOString().slice(0, 10);
  const projectsDeliveredToday = state.projects.filter(p => p.status !== 'running' && p.deliveryDate === todayISO);
  const todayDeliveredValue = projectsDeliveredToday.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0), 0);
  
  const currentMonthKey = getCurrentMonthKey();
  const currentMonthProjects = state.projects.filter(p => p.status !== 'running' && p.deliveryDate?.startsWith(currentMonthKey));
  const currentMonthValue = currentMonthProjects.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0), 0);
  
  const runningProjects = state.projects.filter(p => p.status === 'running');
  const workloadValue = runningProjects.reduce((acc, p) => acc + (parseFloat(p.value) * 0.8 || 0), 0);

  const html = `
    <style>
      .report-form-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 20px; }
      .report-form-label { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
      .report-form-field { flex: 1.5; }
      
      .pill-group { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 4px; }
      .pill-group label { flex: 1; text-align: center; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700; transition: 0.2s; color: #64748b; }
      .pill-group input { display: none; }
      .pill-group label:has(input:checked) { background: white; color: var(--accent); shadow: 0 2px 4px rgba(0,0,0,0.05); }
      
      .custom-time-input { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--primary); cursor: pointer; background: white; }
      .custom-time-input:focus { outline: none; border-color: var(--accent); }
    </style>

    <div style="width:100%; display: flex; justify-content: center; gap: 50px; align-items: flex-start; flex-wrap: wrap; padding: 40px 20px;">
      <!-- Left Column: Graphical Report -->
      <div style="width:520px">
        <div id="todayReportBox" class="report-container" style="padding: 40px; border-radius: 24px;">
          <div class="report-header" style="align-items: center; display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px;">
            <div class="report-title" style="margin: 0; flex: 1; font-size: 24px;">${fullName.toUpperCase()}</div>
            <div class="report-date" style="text-align: right; white-space: nowrap; margin-left: 20px;">${dateStr} <br/> ${timeStr.toUpperCase()}</div>
          </div>
          <div class="report-body">${filtered.map(p => {
            const shortName = p.name.split(' || ')[0];
            return `
            <div class="report-item" style="padding: 14px 0;">
              <div class="report-p-name">${shortName}</div>
              <div class="report-p-note">${p.notes||''}</div>
            </div>`;
          }).join('')}</div>
          <div class="report-footer" style="margin-top: 30px; padding-top: 20px;">
            <div class="report-count">TOTAL TASKS: ${filtered.length}</div>
            <div class="report-brand">WP <span>EMPIRE</span></div>
          </div>
        </div>
        <button class="btn-add" style="width:100%; margin-top:24px; height: 50px; border-radius: 12px;" onclick="window.downloadTodayReport()">Download Report Image</button>
      </div>

      <!-- Right Column: Professional Work Report Form -->
      <div style="width:480px">
        <div class="report-container" style="padding: 40px; border-radius: 24px; background: #fff; border: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 32px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
             <div style="width: 8px; height: 24px; background: var(--accent); border-radius: 100px;"></div>
             <h3 style="font-size: 18px; font-weight: 800; color: var(--primary); letter-spacing: -0.5px;">Work Mission Control</h3>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 8px;">
             <div class="report-form-row">
                <span class="report-form-label">Mission Date</span>
                <span class="report-form-field" style="font-weight: 700; color: var(--primary); font-size: 14px;">${dateStr.replace(/ /g, '/')}</span>
             </div>
             
             <div class="report-form-row">
                <span class="report-form-label">01. In Time</span>
                <div class="report-form-field">
                   <input type="time" id="reportInTime" class="custom-time-input" onclick="this.showPicker()">
                </div>
             </div>

             <div class="report-form-row">
                <span class="report-form-label">02. Issue Status</span>
                <div class="report-form-field">
                   <div class="pill-group">
                      <label><input type="radio" name="reportIssue" value="WIP" checked> WIP</label>
                      <label><input type="radio" name="reportIssue" value="Clear"> Clear</label>
                   </div>
                </div>
             </div>

             <div class="report-form-row">
                <span class="report-form-label">03. Delivered (Today)</span>
                <span class="report-form-field" style="font-weight: 800; color: var(--success); font-size: 16px;">$${todayDeliveredValue.toFixed(0)}</span>
             </div>

             <div class="report-form-row">
                <span class="report-form-label">04. Delivered Till Now</span>
                <span class="report-form-field" style="font-weight: 800; color: var(--primary); font-size: 16px;">$${currentMonthValue.toFixed(0)}</span>
             </div>

             <div class="report-form-row">
                <span class="report-form-label">05. Web WIP</span>
                <span class="report-form-field" style="font-weight: 800; color: #3b82f6; font-size: 16px;">$${workloadValue.toFixed(0)}</span>
             </div>

             <div class="report-form-row">
                <span class="report-form-label">06. Active Projects</span>
                <span class="report-form-field" style="font-weight: 800; color: var(--primary); font-size: 16px;">${String(runningProjects.length).padStart(2, '0')}</span>
             </div>
             
             <div class="report-form-row">
                <span class="report-form-label">07. Progress Sheet</span>
                <div class="report-form-field">
                   <div class="pill-group">
                      <label><input type="radio" name="reportProgress" value="Updated" checked> Updated</label>
                      <label><input type="radio" name="reportProgress" value="Not Updated"> Pending</label>
                   </div>
                </div>
             </div>
          </div>
        </div>
        
        <button class="btn-add" style="width:100%; margin-top:24px; height: 50px; border-radius: 12px; background: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.1);" onclick="window.copyWorkReport(this)">
          Copy Text Report
        </button>
      </div>
    </div>`;
  document.getElementById('mainDisplayArea').innerHTML = html;
}

function renderInsights() {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;

  const now = new Date();
  const month = now.getMonth(); 
  const year = now.getFullYear();
  const groupIdx = Math.floor(month / 3);
  
  const groupMonths = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]
  ];
  
  const currentGroup = groupMonths[groupIdx];
  const groupKeys = currentGroup.map(m => `${year}-${String(m + 1).padStart(2, '0')}`);
  
  let totalGroupTarget = 0;
  currentGroup.forEach(mIdx => {
    if (mIdx <= month) {
      const mKey = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
      const mTarget = state.appConfig.monthTargets[mKey]?.min || 1100;
      totalGroupTarget += mTarget;
    }
  });

  const currentMonthKey = getCurrentMonthKey();
  const groupProjects = state.projects.filter(p => {
    const isActive = p.status === 'running' || p.status === 'revision';
    const pMonth = (isActive && !p.deliveryDate) ? currentMonthKey : p.deliveryDate?.slice(0, 7);
    return groupKeys.includes(pMonth);
  });

  const achieved = groupProjects.reduce((acc, p) => {
    if (p.status === 'running') return acc;
    return acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0);
  }, 0);

  const revenueUSD = achieved - totalGroupTarget;
  const revenueBDT = revenueUSD * 5;
  
  const preCarry = state.appConfig.profile.preCarry || 0;
  const newCarry = state.appConfig.profile.newCarry || 0;
  const finalTotalBDT = revenueBDT + preCarry - newCarry;

  const groupNames = ["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"];
  const groupLabel = groupNames[groupIdx];

  panel.innerHTML = `
    <div class="stat-card stat-target">
      <div class="stat-title">Target (${groupLabel})</div>
      <div class="stat-value">$${totalGroupTarget}</div>
    </div>
    <div class="stat-card stat-achieved">
      <div class="stat-title">Achieved (${groupLabel})</div>
      <div class="stat-value" style="color:var(--success)">$${achieved.toFixed(2)}</div>
    </div>
    <div class="stat-card stat-usd">
      <div class="stat-title">Revenue USD (${groupLabel})</div>
      <div class="stat-value" style="color:${revenueUSD >= 0 ? 'var(--success)' : 'var(--error)'}">$${revenueUSD.toFixed(2)}</div>
    </div>
    <div class="stat-card stat-bdt">
      <div class="stat-title">Revenue BDT (${groupLabel})</div>
      <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
        <span class="stat-value" style="color:${revenueBDT >= 0 ? 'var(--primary)' : 'var(--error)'}">৳${revenueBDT.toFixed(2)}</span>
        <span style="font-size:12px; font-weight:700; color:var(--success)">+৳${preCarry}</span>
        <span style="font-size:12px; font-weight:700; color:var(--error)">-৳${newCarry}</span>
      </div>
    </div>
    <div class="stat-card stat-final">
      <div class="stat-title">Final Total (BDT)</div>
      <div class="stat-value" style="color:${finalTotalBDT >= 0 ? '#0891b2' : 'var(--error)'}">৳${finalTotalBDT.toFixed(2)}</div>
    </div>
  `;
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

export function copyWorkReport(btn) {
  const inTimeRaw = document.getElementById('reportInTime')?.value || '';
  // Convert 24h to 12h format for plain text
  let inTime = inTimeRaw;
  if (inTimeRaw) {
    const [h, m] = inTimeRaw.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    inTime = `${((hr + 11) % 12 + 1)}:${m} ${ampm}`;
  }

  const issue = document.querySelector('input[name="reportIssue"]:checked')?.value || 'WIP';
  const progress = document.querySelector('input[name="reportProgress"]:checked')?.value || 'Updated';
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/ /g, '/');
  
  const todayISO = now.toISOString().slice(0, 10);
  const projectsDeliveredToday = state.projects.filter(p => p.status !== 'running' && p.deliveryDate === todayISO);
  const todayVal = projectsDeliveredToday.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0), 0);
  
  const currentMonthKey = getCurrentMonthKey();
  const currentMonthProjects = state.projects.filter(p => p.status !== 'running' && p.deliveryDate?.startsWith(currentMonthKey));
  const currentMonthVal = currentMonthProjects.reduce((acc, p) => acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0), 0);
  
  const running = state.projects.filter(p => p.status === 'running');
  const workloadVal = running.reduce((acc, p) => acc + (parseFloat(p.value) * 0.8 || 0), 0);

  const text = `Daily Work Report\n\nDate: ${dateStr}\n\n01. In Time: ${inTime}\n\n02. Issue Sheet Status: ${issue}\n\n03. Today Delivered: $${todayVal.toFixed(0)}\n\n04. Delivered Till Now: $${currentMonthVal.toFixed(0)}\n\n05. Workload in Hand: $${workloadVal.toFixed(0)}\n\n06. Number of projects: ${String(running.length).padStart(2, '0')}\n\n07. Progress Sheet Status: ${progress}`;

  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '#64748b';
    }, 2000);
  });
}
