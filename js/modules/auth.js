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

let refreshResolver = null;

export function initGis(callback) {
  console.log('Initializing GIS...');
  try {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, 
      scope: SCOPES,
      callback: async (resp) => { 
        if (resp.error) {
          console.error('GIS Auth Error:', resp.error);
          if (refreshResolver) refreshResolver.reject(resp.error);
          return; 
        }
        console.log('GIS Auth Success');
        handleAuthResponse(resp);
        
        if (refreshResolver) {
          refreshResolver.resolve(resp);
          refreshResolver = null;
        } else {
          // Only sync and show app if this wasn't a silent refresh
          await syncFromCloud();
          showApp();
        }
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

export function handleAuthResponse(resp) {
  const token = {
    ...resp,
    expires_at: Date.now() + (parseInt(resp.expires_in) * 1000)
  };
  localStorage.setItem('google_token', JSON.stringify(token));
  gapi.client.setToken(token);
  if (token.access_token) fetchProfile(token.access_token);
}

export async function refreshToken() {
  if (refreshResolver) return refreshResolver.promise;

  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  refreshResolver = { promise, resolve, reject };

  // Safety timeout: If GIS doesn't respond in 10s, reject
  const timeout = setTimeout(() => {
    if (refreshResolver) {
      console.warn('Refresh token request timed out (possible popup block)');
      refreshResolver.reject(new Error('Timeout'));
      refreshResolver = null;
    }
  }, 10000);

  try {
    state.tokenClient.requestAccessToken({ prompt: '' });
    const result = await promise;
    clearTimeout(timeout);
    return result;
  } catch (e) {
    clearTimeout(timeout);
    console.error('Refresh Token Exception:', e);
    refreshResolver = null;
    throw e;
  }
}

export async function startupCheck() {
  console.log(`Startup check: GAPI=${state.gapiInited}, GIS=${state.gisInited}`);
  if (state.gapiInited && state.gisInited) {
    const saved = localStorage.getItem('google_token');
    if (saved) {
      try {
        console.log('Found saved token, checking validity...');
        const token = JSON.parse(saved);
        const isExpired = !token.expires_at || Date.now() > (token.expires_at - 60000); 

        if (isExpired) {
          console.log('Token expired or expiring soon, attempting silent refresh...');
          try {
            await refreshToken();
            showApp();
            await syncFromCloud();
          } catch (e) {
            console.warn('Silent refresh failed at startup:', e);
            showLogin();
          }
        } else {
          console.log('Token valid, resuming session...');
          gapi.client.setToken(token);
          const profileOk = await fetchProfile(token.access_token);
          if (profileOk) {
            showApp();
            await syncFromCloud();
          } else {
            console.warn('Profile fetch failed (401?), attempting refresh...');
            try {
              await refreshToken();
              showApp();
              await syncFromCloud();
            } catch (e) {
              console.error('Refresh after failed profile fetch failed:', e);
              showLogin();
            }
          }
        }
      } catch (e) {
        console.error('Startup Session Error:', e);
        showLogin();
      } finally {
        hideOverlay();
      }
    } else { 
      console.log('No saved token found, showing login screen.');
      hideOverlay();
      showLogin();
    }
  }
}

function showLogin() {
  const login = document.getElementById('loginScreen');
  if (login) login.style.display = 'flex';
  const dash = document.getElementById('dashboard');
  const side = document.getElementById('sidebar');
  if (dash) dash.style.display = 'none';
  if (side) side.style.display = 'none';
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
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, { 
      headers: { 'Authorization': `Bearer ${token}` } 
    });
    if (res.status === 401) return false;

    const data = await res.json();
    if (data.email) {
      const emailEl = document.getElementById('userEmail');
      const profileEmailEl = document.getElementById('pGoogleEmail');
      if (emailEl) emailEl.textContent = data.email;
      if (profileEmailEl) profileEmailEl.textContent = data.email;
      return true;
    }
    return false;
  } catch (e) {
    console.error('Profile Fetch Error:', e);
    return false;
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
