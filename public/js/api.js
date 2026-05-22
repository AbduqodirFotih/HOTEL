/**
 * api.js — REST API mijozi.
 * Token avtomatik localStorage dan o'qiladi va har bir so'rovga qo'shiladi.
 */
'use strict';

(function () {
  const API_BASE = '/api';
  const TOKEN_KEY = 'hotelos_token';
  const USER_KEY = 'hotelos_user';
  const POLICY_KEY = 'hotelos_policy';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(POLICY_KEY);
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; }
  }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function getPolicy() {
    try { return JSON.parse(localStorage.getItem(POLICY_KEY) || 'null'); } catch (_) { return null; }
  }
  function setPolicy(p) { localStorage.setItem(POLICY_KEY, JSON.stringify(p)); }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(API_BASE + path, opts);
    } catch (err) {
      throw new Error('Tarmoq xatosi — server bilan bog\'lana olmadik');
    }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }

    if (res.status === 401) {
      // Tokeni eskirgan — login ga qaytaramiz
      clearToken();
      if (window.HotelOS && window.HotelOS.onUnauthorized) {
        window.HotelOS.onUnauthorized();
      }
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || `So'rov xatosi (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const API = {
    // Auth
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    logout: () => request('POST', '/auth/logout').catch(() => {}).finally(clearToken),
    me: () => request('GET', '/auth/me'),

    // Reception
    checkIn: (data) => request('POST', '/reception/checkin', data),
    checkOut: (roomNumber, body = {}) => request('POST', `/reception/checkout/${roomNumber}`, body),
    inventory: () => request('GET', '/reception/inventory'),

    // Housekeeping
    housekeepingQueue: () => request('GET', '/housekeeping/queue'),
    startCleaning: (roomNumber) => request('POST', `/housekeeping/start/${roomNumber}`),
    completeCleaning: (roomNumber) => request('POST', `/housekeeping/complete/${roomNumber}`),
    confirmAvailable: (roomNumber) => request('POST', `/reception/confirm-available/${roomNumber}`),
    markNeedsCleaning: (roomNumber) => request('POST', `/reception/mark-needs-cleaning/${roomNumber}`),
    // Legacy alias
    verifyClean: (roomNumber) => request('POST', `/reception/confirm-available/${roomNumber}`),
    addToCleaningQueue: (roomNumber) => request('POST', `/housekeeping/queue/${roomNumber}`),

    // Orders
    orders: () => request('GET', '/orders'),
    activeOrders: () => request('GET', '/orders/active'),
    createOrder: (data) => request('POST', '/orders', data),
    advanceOrder: (id) => request('POST', `/orders/${id}/advance`),
    cancelOrder: (id, reason) => request('POST', `/orders/${id}/cancel`, { reason }),
    menu: () => request('GET', '/menu'),

    // Maintenance
    maintenance: () => request('GET', '/maintenance'),
    maintenanceQueue: () => request('GET', '/maintenance/queue'),
    reportMaintenance: (data) => request('POST', '/maintenance', data),
    acknowledgeMaintenance: (id) => request('POST', `/maintenance/${id}/acknowledge`),
    startMaintenance: (id) => request('POST', `/maintenance/${id}/start`),
    resolveMaintenance: (id, notes) => request('POST', `/maintenance/${id}/resolve`, { notes }),

    // Notifications
    notifications: (limit) => request('GET', `/notifications${limit ? `?limit=${limit}` : ''}`),
    markRead: (id) => request('POST', `/notifications/${id}/read`),
    clearReadNotifications: () => request('POST', '/notifications/clear-read'),

    // Settings
    settings: () => request('GET', '/settings'),
    updateSettings: (patch) => request('PUT', '/settings', patch),
    resetData: () => request('POST', '/settings/reset-data'),

    // Dashboard
    dashboardSummary: () => request('GET', '/dashboard/summary'),

    // Events
    recentEvents: (limit) => request('GET', `/events/recent${limit ? `?limit=${limit}` : ''}`),
    brokerTopics: () => request('GET', '/broker/topics'),

    // Tests
    listTests: () => request('GET', '/tests/list'),
    runTest: (id) => request('POST', `/tests/run/${id}`),
    runAllTests: () => request('POST', '/tests/run-all'),

    // Auth helpers (token storage)
    _auth: { getToken, setToken, clearToken, getUser, setUser, getPolicy, setPolicy },
  };

  window.HotelOS = window.HotelOS || {};
  window.HotelOS.API = API;
})();
