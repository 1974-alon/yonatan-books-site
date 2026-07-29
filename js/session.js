/* =========================================================
   CUSTOMER SESSION — sessionStorage wrapper with 24h expiry
   To update the customer login lifetime — edit SESSION_TTL_MS only.
========================================================= */

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function saveCustomerSession(data) {
  sessionStorage.setItem('yb-auth-customer', JSON.stringify({
    ...data,
    expiresAt: Date.now() + SESSION_TTL_MS
  }));
}

function getCustomerSession() {
  const raw = sessionStorage.getItem('yb-auth-customer');
  if (!raw) return null;

  let data;
  try { data = JSON.parse(raw); } catch { sessionStorage.removeItem('yb-auth-customer'); return null; }

  if (!data.expiresAt || Date.now() > data.expiresAt) {
    sessionStorage.removeItem('yb-auth-customer');
    return null;
  }
  return data;
}

function clearCustomerSession() {
  sessionStorage.removeItem('yb-auth-customer');
}
