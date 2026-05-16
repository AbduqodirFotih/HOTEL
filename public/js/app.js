/**
 * app.js — Asosiy SPA boshqaruvchisi.
 * ============================================================================
 * Vazifalari:
 *   - Login formani boshqarish
 *   - Tizimga kirgan foydalanuvchini saqlash (localStorage)
 *   - Sahifalar o'rtasida marshrutlash (#hash-asosida)
 *   - WebSocket ulanishini boshqarish
 *   - Bildirishnomalarni ko'rsatish
 *   - Hodisalar kelganida tegishli sahifani yangilash
 * ============================================================================
 */
'use strict';

(function () {
  const { API, UI, Pages } = window.HotelOS;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const PAGE_TITLES = {
    dashboard:    { title: 'Dashboard',          subtitle: 'Operatsiyalar haqida umumiy ko\'rinish' },
    rooms:        { title: 'Xonalar',            subtitle: 'Inventar va tozalik holati' },
    reception:    { title: 'Qabul',              subtitle: 'Check-in / Check-out boshqaruvi' },
    housekeeping: { title: 'Tozalash',           subtitle: 'Tozalash navbati va 12-soatlik tsikl' },
    orders:       { title: 'Xona Xizmati',       subtitle: 'Ovqat va ichimlik buyurtmalari' },
    maintenance:  { title: 'Texnik Xizmat',      subtitle: 'Ustuvorlik navbati' },
    tests:        { title: 'Test Stsenariylari', subtitle: 'TS-01 — TS-08 avtomatik testlari' },
    events:       { title: 'Hodisa Jurnali',     subtitle: 'Xabar brokeri jonli oqimi' },
    architecture: { title: 'Arxitektura',        subtitle: 'Tizim tuzilishi va ma\'lumotlar tuzilmalari' },
    settings:     { title: 'Sozlamalar',         subtitle: 'Tizim parametrlarini moslash' },
  };

  let currentPage = 'dashboard';
  let wsConn = null;
  let refreshTimer = null;
  let unreadCount = 0;

  // ===========================================================================
  // LOGIN
  // ===========================================================================
  function initLogin() {
    const form = $('#login-form');
    const errEl = $('#login-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const username = $('#login-username').value.trim();
      const password = $('#login-password').value;
      try {
        const res = await API.login(username, password);
        API._auth.setToken(res.token);
        API._auth.setUser(res.user);
        showApp(res.user);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    // Demo hisob tugmalari
    $$('.demo-account').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('#login-username').value = btn.dataset.user;
        $('#login-password').value = btn.dataset.pass;
        $('#login-password').focus();
      });
    });
  }

  // ===========================================================================
  // MAIN APP
  // ===========================================================================
  function showApp(user) {
    $('#view-login').classList.add('hidden');
    $('#view-app').classList.remove('hidden');

    // Foydalanuvchi panelini to'ldiramiz
    $('#user-name').textContent = user.displayName || user.username;
    $('#user-role').textContent = user.role;
    $('#user-avatar').textContent = (user.displayName || user.username).slice(0, 1).toUpperCase();

    // Navigatsiya hodisalari
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Chiqish
    $('#btn-logout').addEventListener('click', async () => {
      try { await API.logout(); } catch (_) {}
      stopWS();
      stopRefresh();
      location.reload();
    });

    // Bildirishnomalar paneli
    $('#btn-notifications').addEventListener('click', toggleNotifPanel);

    // WebSocket ishga tushirish
    startWS();
    startRefresh();

    // Birinchi sahifani ko'rsatamiz (hash dan yoki dashboard)
    const initialPage = (location.hash || '#dashboard').replace('#', '');
    navigateTo(PAGE_TITLES[initialPage] ? initialPage : 'dashboard');

    // Hash o'zgarishini kuzatamiz
    window.addEventListener('hashchange', () => {
      const page = (location.hash || '#dashboard').replace('#', '');
      if (PAGE_TITLES[page] && page !== currentPage) navigateTo(page, false);
    });
  }

  function navigateTo(page, updateHash = true) {
    if (!PAGE_TITLES[page]) page = 'dashboard';
    currentPage = page;
    if (updateHash) location.hash = page;

    // Sidebar holatini yangilaymiz
    $$('.nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.page === page);
    });

    // Topbar sarlavhasi
    const meta = PAGE_TITLES[page];
    $('#page-title').textContent = meta.title;
    $('#page-subtitle').textContent = meta.subtitle;

    // Sahifa kontentini renderlaymiz
    const container = $('#page-content');
    container.innerHTML = '';
    if (typeof Pages[page] === 'function') {
      Pages[page](container);
    } else {
      container.innerHTML = `<div class="card"><div class="card-body">Sahifa topilmadi.</div></div>`;
    }
  }

  // ===========================================================================
  // WEBSOCKET
  // ===========================================================================
  function startWS() {
    const token = API._auth.getToken();
    wsConn = UI.connectWS({
      token,
      onEvent: handleWsEvent,
      onOpen: () => {
        // Yangi bildirishnomalar sonini olamiz
        refreshNotifCount();
      },
      onClose: () => {},
    });
  }

  function stopWS() {
    if (wsConn) { wsConn.close(); wsConn = null; }
  }

  function handleWsEvent(msg) {
    // Bildirishnoma kelishi: toast ko'rsatamiz va sonni oshiramiz
    if (msg.topic === 'notification.created') {
      const p = msg.payload || {};
      const sev = p.severity === 'critical' ? 'danger'
                : p.severity === 'warning' ? 'warning'
                : p.severity === 'success' ? 'success' : 'info';
      UI.toast(p.message || 'Yangi xabar', { severity: sev });
      unreadCount++;
      updateNotifBadge();
    }

    // Joriy sahifa hodisaga sezgir bo'lsa, yangilaymiz
    const refreshPages = {
      'room.status_changed': ['dashboard', 'rooms', 'housekeeping', 'reception'],
      'guest.checked_in':    ['dashboard', 'reception', 'rooms'],
      'guest.checked_out':   ['dashboard', 'reception', 'rooms', 'housekeeping'],
      'order.created':       ['dashboard', 'orders'],
      'order.status_changed': ['dashboard', 'orders'],
      'maintenance.reported': ['dashboard', 'maintenance'],
      'maintenance.status_changed': ['dashboard', 'maintenance'],
      'room.cleaning_required': ['dashboard', 'housekeeping', 'rooms'],
    };
    const pages = refreshPages[msg.topic] || [];
    if (pages.includes(currentPage)) {
      // Engil debounce — bir nechta hodisa ketma-ket kelsa
      clearTimeout(handleWsEvent._t);
      handleWsEvent._t = setTimeout(() => Pages[currentPage]($('#page-content')), 250);
    }
  }

  // ===========================================================================
  // AUTO-REFRESH (WS ga qo'shimcha sifatida, taymerlar uchun)
  // ===========================================================================
  function startRefresh() {
    stopRefresh();
    // Har 30 sekundda joriy sahifani jimgina yangilaymiz (taymer ko'rsatkichlari uchun)
    refreshTimer = setInterval(() => {
      if (currentPage === 'dashboard' || currentPage === 'rooms' || currentPage === 'housekeeping') {
        Pages[currentPage]($('#page-content'));
      }
    }, 30000);
  }
  function stopRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // ===========================================================================
  // NOTIFICATIONS
  // ===========================================================================
  function updateNotifBadge() {
    const badge = $('#notif-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  async function refreshNotifCount() {
    try {
      const res = await API.notifications(50);
      unreadCount = res.notifications.filter((n) => !n.read).length;
      updateNotifBadge();
    } catch (_) {}
  }

  async function toggleNotifPanel() {
    const existing = document.getElementById('notif-panel');
    if (existing) { existing.remove(); return; }

    let notifs = [];
    try { notifs = (await API.notifications(50)).notifications; } catch (_) {}

    const panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.className = 'notif-panel';
    panel.innerHTML = `
      <div class="notif-panel-header">
        <span class="font-semibold">Bildirishnomalar (${notifs.length})</span>
        <button class="btn btn-ghost btn-sm" id="clear-read">O'qilganlarni o'chirish</button>
      </div>
      <div class="notif-panel-list">
        ${notifs.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Bildirishnomalar yo'q</div>`
          : notifs.map((n) => `
            <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
              <div class="notif-icon ${n.severity}">${notifIcon(n.severity)}</div>
              <div class="notif-body">
                <div class="notif-message">${UI.escapeHtml(n.message)}</div>
                <div class="notif-time">${UI.formatDateTime(n.createdAt)}</div>
              </div>
            </div>
          `).join('')}
      </div>
    `;
    document.body.appendChild(panel);

    // Klikda o'qilgan deb belgilaymiz
    panel.querySelectorAll('.notif-item').forEach((it) => {
      it.addEventListener('click', async () => {
        if (it.classList.contains('unread')) {
          it.classList.remove('unread');
          unreadCount = Math.max(0, unreadCount - 1);
          updateNotifBadge();
          try { await API.markRead(it.dataset.id); } catch (_) {}
        }
      });
    });

    panel.querySelector('#clear-read').addEventListener('click', async () => {
      try {
        await API.clearReadNotifications();
        panel.remove();
        refreshNotifCount();
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    });

    // Tashqariga klik — yopish
    setTimeout(() => {
      const closeOnOutside = (ev) => {
        if (!panel.contains(ev.target) && ev.target.id !== 'btn-notifications') {
          panel.remove();
          document.removeEventListener('click', closeOnOutside);
        }
      };
      document.addEventListener('click', closeOnOutside);
    }, 0);
  }

  function notifIcon(severity) {
    return ({ critical: '!', warning: '!', success: '✓', info: 'i' })[severity] || 'i';
  }

  // ===========================================================================
  // BOOT
  // ===========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    // Allaqachon login bo'lganmi tekshiramiz
    const token = API._auth.getToken();
    const user = API._auth.getUser();
    if (token && user) {
      // Tokenni server bilan tekshiramiz
      API.me()
        .then((res) => showApp(res.user))
        .catch(() => {
          API._auth.clearToken();
        });
    }
  });

  // 401 da login ekraniga qaytaramiz
  window.HotelOS.onUnauthorized = () => {
    stopWS();
    stopRefresh();
    setTimeout(() => location.reload(), 100);
  };
})();
