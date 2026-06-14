'use strict';

// ── API BASE URL ───────────────────────────────────────────
// Remplace par ton URL Render après déploiement
const API_BASE = window.API_BASE || 'https://eduflow-backend-9ytv.onrender.com';

function api(path, method, data) {
  return fetch(API_BASE + path, {
    method: method || 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined
  }).then(r => r.json());
}
