import { state } from './state.js';
import { syncFromCloud } from './drive.js';

const CLIENT_ID = '1030020126890-mkpj8eov6nhblo9uel0dt5d0b7sr4ehi.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata email profile';

export function initGapi(callback) { 
  console.log('Initializing GAPI...');
  gapi.load('client', {
    callback: async () => { 
      try {
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }); 
        state.gapiInited = true; 
        console.log('GAPI initialized successfully');
        callback(); 
      } catch (e) { 
        console.error('GAPI Init Error:', e); 
        hideOverlay(); 
      }
    },
    onerror: () => {
      console.error('GAPI Load Error');
      hideOverlay();
    },
    timeout: 5000,
    ontimeout: () => {
      console.error('GAPI Load Timeout');
      hideOverlay();
    }
  }); 
}

export function initGis(callback) {
  console.log('Initializing GIS...');
  try {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, 
      scope: SCOPES,
      callback: async (resp) => { 
        if (resp.error) {
          console.error('GIS Auth Error:', resp.error);
          return; 
        }
        console.log('GIS Auth Success');
        localStorage.setItem('google_token', JSON.stringify(resp)); 
        gapi.client.setToken(resp);
        if (resp.access_token) fetchProfile(resp.access_token);
        await syncFromCloud();
        showApp();
      }
    });
    state.gisInited = true; 
    console.log('GIS initialized successfully');
    callback();
  } catch (e) {
    console.error('GIS Init Error:', e);
    hideOverlay();
  }
}

export async function startupCheck() {
  console.log(`Startup check: GAPI=${state.gapiInited}, GIS=${state.gisInited}`);
  if (state.gapiInited && state.gisInited) {
    const saved = localStorage.getItem('google_token');
    if (saved) {
      try {
        console.log('Found saved token, attempting to resume session...');
        const token = JSON.parse(saved);
        gapi.client.setToken(token);
        if (token.access_token) fetchProfile(token.access_token);
        showApp();
        await syncFromCloud();
      } catch (e) {
        console.error('Startup Session Error:', e);
      } finally {
        hideOverlay();
      }
    } else { 
      console.log('No saved token found, showing login screen.');
      hideOverlay();
      const login = document.getElementById('loginScreen');
      if (login) login.style.display = 'flex'; 
    }
  }
}

export function hideOverlay() { 
  console.log('Hiding loading overlay');
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none'; 
}

function showApp() {
  console.log('Showing application dashboard');
  const login = document.getElementById('loginScreen');
  const dash = document.getElementById('dashboard');
  const side = document.getElementById('sidebar');
  if (login) login.style.display = 'none';
  if (dash) dash.style.display = 'block';
  if (side) side.style.display = 'flex';
  if (window.render) window.render();
}

async function fetchProfile(token) {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (data.email) {
      const emailEl = document.getElementById('userEmail');
      const profileEmailEl = document.getElementById('pGoogleEmail');
      if (emailEl) emailEl.textContent = data.email;
      if (profileEmailEl) profileEmailEl.textContent = data.email;
    }
  } catch (e) {
    console.error('Profile Fetch Error:', e);
  }
}

// Global fallback to ensure overlay is hidden after 10 seconds
setTimeout(() => {
  const el = document.getElementById('loadingOverlay');
  if (el && el.style.display !== 'none') {
    console.warn('Startup timed out. Forcing overlay hide.');
    hideOverlay();
  }
}, 10000);
