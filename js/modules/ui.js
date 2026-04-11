import { state, CATEGORIES, getCD, getCurrentMonthKey } from './state.js';

export function render() {
  const mainArea = document.getElementById('mainDisplayArea');
  if (!mainArea) return;
  
  // Update Quarter Dropdown
  renderQuarterSelect();
  renderInsights();

  mainArea.innerHTML = '';
  if (state.currentFilter === 'today' || state.currentFilter === 'account') { renderProfileView(); return; }
  
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
  updateSidebarCounts();
}

function renderQuarterSelect() {
  const select = document.getElementById('quarterSelect');
  if (!select) return;

  const startYear = 2025, startQ = 3; // Oct-Dec 2025
  const now = new Date(), currentYear = now.getFullYear(), currentQ = Math.floor(now.getMonth() / 3);
  
  if (!state.selectedQuarter) {
    state.selectedQuarter = { year: currentYear, qIdx: currentQ };
  }

  // Find latest quarter with data
  let latestYear = currentYear, latestQ = currentQ;
  state.projects.forEach(p => {
    const dateStr = p.deliveryDate || p.deadline;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear(), q = Math.floor(d.getMonth() / 3);
        if (y > latestYear || (y === latestYear && q > latestQ)) {
          latestYear = y; latestQ = q;
        }
      }
    }
  });

  const qNames = ["Jan – Mar", "Apr – Jun", "Jul – Sep", "Oct – Dec"];
  const quarters = [];
  let y = startYear, q = startQ;
  
  while (y < latestYear || (y === latestYear && q <= latestQ)) {
    quarters.push({ y, q });
    q++; if (q > 3) { q = 0; y++; }
  }

  select.innerHTML = quarters.reverse().map(item => {
    const val = `${item.y}-${item.q}`;
    const isSelected = state.selectedQuarter.year === item.y && state.selectedQuarter.qIdx === item.q;
    return `<option value="${val}" ${isSelected ? 'selected' : ''}>${qNames[item.q]} ${item.y}</option>`;
  }).join('');
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
  
  // Calculate dynamic monthly target from quarterly config
  const [year, month] = monthKey.split('-').map(Number);
  const qIdx = Math.floor((month - 1) / 3);
  const qKey = `${year}-${qIdx}`;
  const qCfg = state.appConfig.quarterConfigs?.[qKey] || { min: 3300 };
  const monthlyMin = qCfg.min / 3;
  
  const revenueUSD = achieved - monthlyMin;
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
            <span class="h-stat-value">$${monthlyMin.toFixed(0)}</span>
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

function renderProfileView() {
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

  // Quarter Selection for Config
  const startYear = 2025, startQ = 3; // Oct-Dec 2025
  const currentYear = now.getFullYear(), currentQ = Math.floor(now.getMonth() / 3);
  
  // Find latest quarter with data
  let latestYear = currentYear, latestQ = currentQ;
  state.projects.forEach(p => {
    const dateStr = p.deliveryDate || p.deadline;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear(), q = Math.floor(d.getMonth() / 3);
        if (y > latestYear || (y === latestYear && q > latestQ)) {
          latestYear = y; latestQ = q;
        }
      }
    }
  });

  const qNames = ["Jan – Mar", "Apr – Jun", "Jul – Sep", "Oct – Dec"];
  const targetQKey = state.targetQuarter || `${currentYear}-${currentQ}`;
  const qCfg = state.appConfig.quarterConfigs?.[targetQKey] || { min: 3300, preCarry: 0, newCarry: 0 };
  
  const quartersArr = [];
  let tempY = startYear, tempQ = startQ;
  while (tempY < latestYear || (tempY === latestYear && tempQ <= latestQ)) {
    quartersArr.push({ y: tempY, q: tempQ });
    tempQ++; if (tempQ > 3) { tempQ = 0; tempY++; }
  }

  const qOptions = quartersArr.reverse().map(item => {
    const val = `${item.y}-${item.q}`;
    return `<option value="${val}" ${val === targetQKey ? 'selected' : ''}>${qNames[item.q]} ${item.y}</option>`;
  }).join('');

  const pData = state.appConfig.profile;
  // Format Dynamic Brand
  let brandHTML = 'WP <span>EMPIRE</span>';
  if (pData.teamName) {
    const parts = pData.teamName.trim().split(' ');
    if (parts.length > 1) {
      const last = parts.pop();
      brandHTML = `${parts.join(' ')} <span>${last}</span>`;
    } else {
      brandHTML = pData.teamName;
    }
  }

  const html = `
    <style>
      .profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 32px; padding: 40px 20px; align-items: stretch; }
      .profile-card { background: white; border: 1px solid var(--border); border-radius: 24px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; flex-direction: column; }
      .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; }
      .card-title { font-size: 18px; font-weight: 800; color: var(--primary); letter-spacing: -0.5px; margin: 0; }
      .card-accent { width: 8px; height: 24px; background: var(--accent); border-radius: 100px; }
      
      .report-form-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 20px; }
      .report-form-label { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
      .report-form-field { flex: 1.5; }
      
      .pill-group { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 4px; }
      .pill-group label { flex: 1; text-align: center; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 700; transition: 0.2s; color: #64748b; }
      .pill-group input { display: none; }
      .pill-group label:has(input:checked) { background: white; color: var(--accent); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
      
      .custom-time-input { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--primary); cursor: pointer; background: white; }
      
      .account-input-group { margin-bottom: 20px; }
      .account-label { display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 8px; text-transform: uppercase; }
      .account-field { width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-weight: 600; transition: 0.2s; }
      .account-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
      .target-month-select { margin-bottom: 16px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-weight: 700; color: var(--accent); cursor: pointer; width: 100%; outline: none; }
    </style>

    <div class="profile-grid">
      <!-- Card 1: Today Tasks Graphical Report -->
      <div class="profile-card" style="padding: 0; background: transparent; border: none; box-shadow: none;">
        <div class="report-wrapper" style="flex: 1; display: flex; flex-direction: column;">
          <div id="todayReportBox" class="report-container" style="padding: 40px; border-radius: 24px; background: white; border: 1px solid var(--border); flex: 1; display: flex; flex-direction: column;">
            <div class="report-header" style="align-items: center; display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px;">
              <div class="report-title" style="margin: 0; flex: 1; font-size: 24px;">${fullName.toUpperCase()}</div>
              <div class="report-date" style="text-align: right; white-space: nowrap; margin-left: 20px;">${dateStr} <br/> ${timeStr.toUpperCase()}</div>
            </div>
            <div class="report-body" style="flex: 1;">${filtered.map(p => {
              const shortName = p.name.split(' || ')[0];
              return `
              <div class="report-item" style="padding: 14px 0;">
                <div class="report-p-name">${shortName}</div>
                <div class="report-p-note">${p.notes||''}</div>
              </div>`;
            }).join('')}</div>
            <div class="report-footer" style="margin-top: 30px; padding-top: 20px;">
              <div class="report-count">TOTAL TASKS: ${filtered.length}</div>
              <div class="report-brand">${brandHTML}</div>
            </div>
          </div>
        </div>
        <button class="btn-add" style="width:100%; margin-top:20px; height: 50px; border-radius: 12px;" onclick="window.downloadTodayReport()">Download Report Image</button>
      </div>

      <!-- Card 2: Work Progress (Mission Control) -->
      <div class="profile-card">
        <div class="card-header">
           <div class="card-accent"></div>
           <h3 class="card-title">Work Mission Control</h3>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
           <div class="report-form-row">
              <span class="report-form-label">Date</span>
              <span class="report-form-field" style="font-weight: 700; color: var(--primary); font-size: 14px;">${dateStr.replace(/ /g, '/')}</span>
           </div>
           
           <div class="report-form-row">
              <span class="report-form-label">01. In Time</span>
              <div class="report-form-field">
                 <input type="time" id="reportInTime" class="custom-time-input" onclick="this.showPicker()">
              </div>
           </div>

           <div class="report-form-row">
              <span class="report-form-label">02. Issue Sheet Status</span>
              <div class="report-form-field">
                 <div class="pill-group">
                    <label><input type="radio" name="reportIssue" value="WIP" checked> WIP</label>
                    <label><input type="radio" name="reportIssue" value="Clear"> Clear</label>
                 </div>
              </div>
           </div>

           <div class="report-form-row">
              <span class="report-form-label">03. Today Delivered</span>
              <span class="report-form-field" style="font-weight: 800; color: var(--success); font-size: 16px;">$${todayDeliveredValue.toFixed(0)}</span>
           </div>

           <div class="report-form-row">
              <span class="report-form-label">04. Delivered Till Now</span>
              <span class="report-form-field" style="font-weight: 800; color: var(--primary); font-size: 16px;">$${currentMonthValue.toFixed(0)}</span>
           </div>

           <div class="report-form-row">
              <span class="report-form-label">05. Workload in Hand</span>
              <span class="report-form-field" style="font-weight: 800; color: #3b82f6; font-size: 16px;">$${workloadValue.toFixed(0)}</span>
           </div>

           <div class="report-form-row">
              <span class="report-form-label">06. Number of projects</span>
              <span class="report-form-field" style="font-weight: 800; color: var(--primary); font-size: 16px;">${String(runningProjects.length).padStart(2, '0')}</span>
           </div>
           
           <div class="report-form-row">
              <span class="report-form-label">07. Progress Sheet Status</span>
              <div class="report-form-field">
                 <div class="pill-group">
                    <label><input type="radio" name="reportProgress" value="Updated" checked> Updated</label>
                    <label><input type="radio" name="reportProgress" value="Not Updated"> Pending</label>
                 </div>
              </div>
           </div>

           <div class="report-form-row">
              <span class="report-form-label">08. Note</span>
              <div class="report-form-field">
                 <input type="text" id="reportNote" class="custom-time-input" placeholder="Optional notes...">
              </div>
           </div>
        </div>
        
        <button class="btn-add" style="width:100%; margin-top:24px; height: 50px; border-radius: 12px; background: var(--primary);" onclick="window.copyWorkReport(this)">
          Copy Text Report
        </button>
      </div>

      <!-- Card 3: Account Settings -->
      <div class="profile-card">
        <div class="card-header">
           <div class="card-accent" style="background: #64748b;"></div>
           <h3 class="card-title">Account Settings</h3>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1;">
          <div class="account-input-group">
            <label class="account-label">Full Name</label>
            <input class="account-field" id="pName" value="${pData.name || ''}" placeholder="John Doe" onchange="window.saveProfile()"/>
          </div>
          <div class="account-input-group">
            <label class="account-label">User ID</label>
            <input class="account-field" id="pUserId" value="${pData.userId || ''}" placeholder="16669" onchange="window.saveProfile()"/>
          </div>
          <div class="account-input-group">
            <label class="account-label">Team Name</label>
            <input class="account-field" id="pTeamName" value="${pData.teamName || ''}" placeholder="WP Empire" onchange="window.saveProfile()"/>
          </div>
          <div class="account-input-group">
            <label class="account-label">Google Email</label>
            <div style="padding: 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis;" id="pGoogleEmail">...</div>
          </div>
        </div>

        <div style="margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          <h4 style="font-size: 13px; font-weight: 800; margin-bottom: 16px; color: var(--primary);">Quarterly Targets & Carry</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="account-input-group">
              <label class="account-label">Target Quarter</label>
              <select id="pTargetQuarter" class="target-month-select" style="margin-bottom:0;" onchange="window.setTargetQuarter(this.value)">
                 ${qOptions}
              </select>
            </div>
            <div class="account-input-group">
              <label class="account-label">Min. Target ($)</label>
              <input type="number" class="account-field" id="pMinTarget" value="${qCfg.min}" onchange="window.saveProfile()"/>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="account-input-group">
              <label class="account-label">Pre. Carry (BDT)</label>
              <input type="number" class="account-field" id="pPreCarry" value="${qCfg.preCarry || 0}" onchange="window.saveProfile()"/>
            </div>
            <div class="account-input-group">
              <label class="account-label">New Carry (BDT)</label>
              <input type="number" class="account-field" id="pNewCarry" value="${qCfg.newCarry || 0}" onchange="window.saveProfile()"/>
            </div>
          </div>
        </div>

        <div style="margin-top: 24px; display: flex; flex-direction: column; gap: 12px;">
          <div style="grid-template-columns: 1fr 1fr; display: grid; gap: 12px;">
            <button class="btn-add" style="background: #64748b; font-size: 12px; height: 40px;" onclick="window.exportData()">Export JSON</button>
            <button class="btn-add" style="background: #94a3b8; font-size: 12px; height: 40px;" onclick="document.getElementById('importFile').click()">Import JSON</button>
          </div>
          <button class="btn-action" style="color: var(--error); border-color: #fadad7; width: 100%; height: 40px; font-size: 12px;" onclick="window.eraseAllData()">Erase All Data</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('mainDisplayArea').innerHTML = html;
  
  // Set the email after rendering
  const email = document.getElementById('userEmail')?.textContent;
  if (email && document.getElementById('pGoogleEmail')) {
    document.getElementById('pGoogleEmail').textContent = email;
  }
}

function renderInsights() {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;

  const now = new Date();
  const currentQYear = now.getFullYear();
  const currentQIdx = Math.floor(now.getMonth() / 3);

  if (!state.selectedQuarter) {
    state.selectedQuarter = { year: currentQYear, qIdx: currentQIdx };
  }
  
  const { year, qIdx } = state.selectedQuarter;
  const qKey = `${year}-${qIdx}`;
  const qCfg = state.appConfig.quarterConfigs?.[qKey] || { min: 3300, preCarry: 0, newCarry: 0 };

  const groupMonths = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  const selectedGroup = groupMonths[qIdx];
  const groupKeys = selectedGroup.map(m => `${year}-${String(m + 1).padStart(2, '0')}`);
  
  let totalGroupTarget = 0;
  selectedGroup.forEach(mIdx => {
    // Only add target if it's not a future month relative to "today"
    // OR if we are looking at a past year
    if (year < currentQYear || (year === currentQYear && mIdx <= now.getMonth())) {
      totalGroupTarget += (qCfg.min / 3);
    }
  });

  const groupProjects = state.projects.filter(p => {
    const isActive = p.status === 'running' || p.status === 'revision';
    const currentMonthKey = getCurrentMonthKey();
    const pMonth = (isActive && !p.deliveryDate) ? currentMonthKey : p.deliveryDate?.slice(0, 7);
    return groupKeys.includes(pMonth);
  });

  const achieved = groupProjects.reduce((acc, p) => {
    if (p.status === 'running') return acc;
    return acc + (parseFloat(p.share) || parseFloat(p.value) * 0.8 || 0);
  }, 0);

  const revenueUSD = achieved - totalGroupTarget;
  const revenueBDT = revenueUSD * 5;
  
  const preCarry = qCfg.preCarry || 0;
  const newCarry = qCfg.newCarry || 0;
  const finalTotalBDT = revenueBDT + preCarry - newCarry;

  const groupNames = ["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"];
  const groupLabel = groupNames[qIdx];

  panel.innerHTML = `
    <div class="stat-card stat-target">
      <div class="stat-title">Target (${groupLabel} ${year}) ${year === currentQYear && qIdx === currentQIdx ? '' : '<span style="color:var(--error); font-size:9px;">HISTORY</span>'}</div>
      <div class="stat-value">$${totalGroupTarget.toFixed(0)}</div>
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
  
  // Create a clone to handle capturing without visual layout shifts
  const clone = box.cloneNode(true);
  clone.style.position = 'fixed';
  clone.style.top = '-9999px';
  clone.style.height = 'auto'; // Let content define height
  clone.style.flex = 'none';
  document.body.appendChild(clone);
  
  const canvas = await html2canvas(clone, { scale: 2 });
  document.body.removeChild(clone);
  
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
  const note = document.getElementById('reportNote')?.value || '';
  
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

  let text = `Daily Work Report\n\nDate: ${dateStr}\n\n01. In Time: ${inTime}\n\n02. Issue Sheet Status: ${issue}\n\n03. Today Delivered: $${todayVal.toFixed(0)}\n\n04. Delivered Till Now: $${currentMonthVal.toFixed(0)}\n\n05. Workload in Hand: $${workloadVal.toFixed(0)}\n\n06. Number of projects: ${String(running.length).padStart(2, '0')}\n\n07. Progress Sheet Status: ${progress}`;
  
  if (note.trim()) {
    text += `\n\n08. Note: ${note}`;
  }

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
