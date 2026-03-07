import { state } from './state.js';
import { refreshToken } from './auth.js';

async function gapiCall(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.status === 401) {
      console.log('GAPI 401 error, attempting refresh...');
      try {
        await refreshToken();
        return await fn();
      } catch (refreshError) {
        console.error('Refresh failed during GAPI call:', refreshError);
        throw refreshError;
      }
    }
    throw e;
  }
}

export async function syncFromCloud() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  console.log('Syncing from cloud...');
  try {
    const res = await gapiCall(() => gapi.client.drive.files.list({ spaces: 'appDataFolder', fields: 'files(id, name)' }));
    if (!res.result || !res.result.files) {
      console.warn('No files found in appDataFolder or result is empty');
      setSyncUI('synced');
      return;
    }
    
    const file = res.result.files.find(f => f.name === 'projects_v2.json');
    if (file) {
      state.driveFileId = file.id;
      console.log('Found cloud file:', state.driveFileId);
      const content = await gapiCall(() => gapi.client.drive.files.get({ fileId: state.driveFileId, alt: 'media' }));
      
      let data = content.result;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error('Failed to parse cloud data string:', e);
          data = null;
        }
      }

      if (data && (data.projects || data.config)) {
        console.log('Successfully loaded data from cloud');
        if (data.projects) state.projects = data.projects;
        if (data.config) state.appConfig = data.config;
        localStorage.setItem('p_data', JSON.stringify(state.projects));
        localStorage.setItem('app_config', JSON.stringify(state.appConfig));
        if (window.render) window.render();
      }
    } else {
      console.log('No cloud file "projects_v2.json" found.');
    }
    setSyncUI('synced');
  } catch (e) { 
    console.error('Sync Error:', e); 
    setSyncUI('failed'); 
  }
  finally { state.isSyncing = false; }
}

export async function syncToCloud() {
  if (!gapi.client.getToken()) return;
  setSyncUI('saving');
  try {
    const boundary = '-------314159265358979323846';
    const metadata = { name: 'projects_v2.json', mimeType: 'application/json' };
    if (!state.driveFileId) metadata.parents = ['appDataFolder'];
    const payload = { projects: state.projects, config: state.appConfig };
    const body = [
      '--' + boundary, 
      'Content-Type: application/json; charset=UTF-8', 
      '', 
      JSON.stringify(metadata), 
      '--' + boundary, 
      'Content-Type: application/json', 
      '', 
      JSON.stringify(payload), 
      '--' + boundary + '--'
    ].join('\r\n');

    const res = await gapiCall(() => gapi.client.request({ 
      path: state.driveFileId ? `/upload/drive/v3/files/${state.driveFileId}` : '/upload/drive/v3/files', 
      method: state.driveFileId ? 'PATCH' : 'POST', 
      params: { uploadType: 'multipart' }, 
      headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, 
      body: body 
    }));

    if (!state.driveFileId && res.result.id) state.driveFileId = res.result.id;
    setSyncUI('synced');
  } catch (e) { 
    console.error('Upload Error:', e);
    setSyncUI('failed'); 
  }
}

export async function manualSync() {
  console.log('Manual sync requested...');
  await syncFromCloud();
  await syncToCloud();
}

function setSyncUI(status) {
  const btn = document.getElementById('syncBtn'), txt = document.getElementById('syncText');
  if (btn && txt) {
    btn.className = 'sync-btn ' + (status === 'synced' ? 'sync-synced' : (status === 'failed' ? 'sync-failed' : ''));
    txt.textContent = status.toUpperCase();
  }
}
