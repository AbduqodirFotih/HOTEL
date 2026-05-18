/**
 * app.js — SPA boshqaruvchisi (rolga asoslangan)
 * ============================================================================
 *   - Login
 *   - Roldan kelib chiqib sidebar va boshlang'ich sahifa
 *   - Sahifalararo marshrutlash (#hash)
 *   - WebSocket ulanishi
 *   - Bildirishnoma paneli
 *   - Ruxsat etilmagan sahifalarga kirishni rad etish
 * ============================================================================
 */
'use strict';

(function () {
  const { API, UI, Pages } = window.HotelOS;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Sahifa metadata
  const PAGE_META = {
    dashboard:    { title: 'Dashboard',         subtitle: 'Operatsiyalar haqida umumiy ko\'rinish', icon: '▦' },
    rooms:        { title: 'Xonalar',           subtitle: 'Inventar va tozalik holati', icon: '▢' },
    reception:    { title: 'Qabul',             subtitle: 'Check-in / Check-out boshqaruvi', icon: '⊙' },
    housekeeping: { title: 'Tozalash',          subtitle: 'Tozalash navbati va 12-soatlik tsikl', icon: '✦' },
    orders:       { title: 'Xona Xizmati',      subtitle: 'Ovqat va ichimlik buyurtmalari', icon: '◇' },
    maintenance:  { title: 'Texnik Xizmat',     subtitle: 'Ustuvorlik navbati', icon: '⚒' },
    tests:        { title: 'Test Stsenariylari',subtitle: 'TS-01 — TS-08 avtomatik testlari', icon: '⚐' },
    events:       { title: 'Hodisa Jurnali',    subtitle: 'Xabar brokeri jonli oqimi', icon: '⌬' },
    architecture: { title: 'Arxitektura',       subtitle: 'Tizim tuzilishi va ma\'lumotlar tuzilmalari', icon: '⊞' },
    settings:     { title: 'Sozlamalar',        subtitle: 'Tizim parametrlarini moslash', icon: '⚙' },
  };

  // Har bir rol uchun ruxsat etilgan sahifalar va boshlang'ich sahifa
  const ROLE_PAGES = {
    manager: {
      home: 'dashboard',
      sections: [
        { label: 'Operatsiyalar', pages: ['dashboard', 'rooms', 'reception', 'housekeeping', 'orders', 'maintenance'] },
        { label: 'Tahlil', pages: ['tests', 'events', 'architecture'] },
        { label: 'Tizim', pages: ['settings'] },
      ],
    },
    reception: {
      home: 'reception',
      sections: [
        { label: 'Operatsiyalar', pages: ['dashboard', 'reception', 'rooms', 'orders', 'maintenance'] },
      ],
    },
    housekeeping: {
      home: 'housekeeping',
      sections: [
        { label: 'Operatsiyalar', pages: ['dashboard', 'housekeeping', 'rooms', 'maintenance'] },
      ],
    },
    maintenance: {
      home: 'maintenance',
      sections: [
        { label: 'Operatsiyalar', pages: ['dashboard', 'maintenance', 'rooms'] },
      ],
    },
  };

  // Rol nomlarini chiroyli ko'rsatish
  const ROLE_DISPLAY = {
    manager: 'Bosh Menejer',
    reception: 'Qabul Xodimi',
    housekeeping: 'Tozalash Xodimi',
    maintenance: 'Texnik Xodim',
  };

  let currentPage = 'dashboard';
  let currentRole = 'manager';
  let allowedPagesSet = new Set();
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

    $$('.demo-account').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('#login-username').value = btn.dataset.user;
        $('#login-password').value = btn.dataset.pass;
        $('#login-password').focus();
      });
    });
  }

  // ===========================================================================
  // MAIN APP — rolga qarab UI ni qurish
  // ===========================================================================
  function showApp(user) {
    currentRole = user.role;
    const roleConfig = ROLE_PAGES[currentRole] || ROLE_PAGES.manager;

    // Ruxsat etilgan sahifalarni hisoblash
    allowedPagesSet = new Set();
    for (const section of roleConfig.sections) {
      for (const p of section.pages) allowedPagesSet.add(p);
    }

    $('#view-login').classList.add('hidden');
    $('#view-app').classList.remove('hidden');

    // Foydalanuvchi paneli
    $('#user-name').textContent = user.displayName || user.username;
    $('#user-role').textContent = ROLE_DISPLAY[user.role] || user.role;
    $('#user-avatar').textContent = (user.displayName || user.username).slice(0, 1).toUpperCase();

    // Topbar rol chipi
    const chip = $('#role-chip');
    chip.textContent = ROLE_DISPLAY[user.role] || user.role;
    chip.className = `role-chip ${user.role}`;

    // Sidebar ni qurish
    buildSidebar(roleConfig);

    // Chiqish tugmasi
    $('#btn-logout').addEventListener('click', async () => {
      try { await API.logout(); } catch (_) {}
      stopWS();
      stopRefresh();
      location.reload();
    });

    // Bildirishnomalar
    $('#btn-notifications').addEventListener('click', toggleNotifPanel);

    startWS();
    startRefresh();

    // Birinchi sahifa: hash dan yoki rolning bosh sahifasi
    const hashed = (location.hash || '').replace('#', '');
    const initialPage = (hashed && allowedPagesSet.has(hashed)) ? hashed : roleConfig.home;
    navigateTo(initialPage);

    // Hash o'zgarishini kuzatish (ruxsat tekshiruvi bilan)
    window.addEventListener('hashchange', () => {
      const page = (location.hash || '').replace('#', '');
      if (!page || page === currentPage) return;
      navigateTo(page, false);
    });
  }

  function buildSidebar(roleConfig) {
    const nav = $('#sidebar-nav');
    nav.innerHTML = '';
    for (const section of roleConfig.sections) {
      const sec = document.createElement('div');
      sec.className = 'nav-section';
      sec.innerHTML = `<div class="nav-section-label">${section.label}</div>`;
      for (const pageId of section.pages) {
        const meta = PAGE_META[pageId];
        if (!meta) continue;
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.dataset.page = pageId;
        btn.innerHTML = `<span class="nav-item-icon">${meta.icon}</span> ${meta.title}`;
        btn.addEventListener('click', () => navigateTo(pageId));
        sec.appendChild(btn);
      }
      nav.appendChild(sec);
    }
  }

  function navigateTo(page, updateHash = true) {
    // Ruxsat tekshiruvi
    if (!allowedPagesSet.has(page)) {
      renderAccessDenied(page);
      return;
    }
    if (!PAGE_META[page]) {
      page = ROLE_PAGES[currentRole].home;
    }
    currentPage = page;
    if (updateHash) location.hash = page;

    // Active nav item
    $$('.nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.page === page);
    });

    // Topbar
    const meta = PAGE_META[page];
    $('#page-title').textContent = meta.title;
    $('#page-subtitle').textContent = meta.subtitle;

    // Render
    const container = $('#page-content');
    container.innerHTML = '';
    if (typeof Pages[page] === 'function') {
      Pages[page](container, currentRole);
    } else {
      renderAccessDenied(page);
    }
  }

  function renderAccessDenied(page) {
    $('#page-title').textContent = 'Ruxsat yo\'q';
    $('#page-subtitle').textContent = 'Bu sahifani ko\'rish uchun yetarli huquqlaringiz yo\'q';
    $('#page-content').innerHTML = `
      <div class="access-denied">
        <div class="access-denied-icon">🔒</div>
        <div class="access-denied-title">Bu bo'limga kirish ruxsati yo'q</div>
        <div class="access-denied-message">
          "${PAGE_META[page]?.title || page}" sahifasi sizning rolingiz (<b>${ROLE_DISPLAY[currentRole]}</b>) uchun
          ruxsat etilmagan. Agar bu sizga keraksiz deb hisoblasangiz, bosh menejer bilan bog'laning.
        </div>
        <button class="btn btn-primary" onclick="location.hash='${ROLE_PAGES[currentRole].home}'">
          Bosh sahifaga qaytish
        </button>
      </div>
    `;
  }

  // ===========================================================================
  // WEBSOCKET
  // ===========================================================================
  function startWS() {
    const token = API._auth.getToken();
    wsConn = UI.connectWS({
      token,
      onEvent: handleWsEvent,
      onOpen: () => refreshNotifCount(),
      onClose: () => {},
    });
  }

  function stopWS() {
    if (wsConn) { wsConn.close(); wsConn = null; }
  }

  function handleWsEvent(msg) {
    if (msg.topic === 'notification.created') {
      const p = msg.payload || {};
      const sev = p.severity === 'critical' ? 'danger'
                : p.severity === 'warning' ? 'warning'
                : p.severity === 'success' ? 'success' : 'info';
      if (p.message) UI.toast(p.message, { severity: sev });
      unreadCount++;
      updateNotifBadge();
    }

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
    if (pages.includes(currentPage) && allowedPagesSet.has(currentPage)) {
      clearTimeout(handleWsEvent._t);
      handleWsEvent._t = setTimeout(() => Pages[currentPage]($('#page-content'), currentRole), 250);
    }
  }

  // ===========================================================================
  // AUTO-REFRESH
  // ===========================================================================
  function startRefresh() {
    stopRefresh();
    refreshTimer = setInterval(() => {
      if (['dashboard', 'rooms', 'housekeeping'].includes(currentPage) && allowedPagesSet.has(currentPage)) {
        Pages[currentPage]($('#page-content'), currentRole);
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
    const token = API._auth.getToken();
    const user = API._auth.getUser();
    if (token && user) {
      API.me()
        .then((res) => showApp(res.user))
        .catch(() => { API._auth.clearToken(); });
    }
  });

  window.HotelOS.onUnauthorized = () => {
    stopWS();
    stopRefresh();
    setTimeout(() => location.reload(), 100);
  };

  // Tashqi qulaylik (debug uchun)
  window.HotelOS.currentRole = () => currentRole;
  window.HotelOS.allowedPages = () => Array.from(allowedPagesSet);
})();
