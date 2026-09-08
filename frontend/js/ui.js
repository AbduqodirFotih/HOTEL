/**
 * ui.js — UI yordamchilari.
 * Toast bildirishnomalari, modal, formatlash funksiyalari, WebSocket ulanishi.
 */
'use strict';

(function () {
  const ICONS = { success: '✓', info: 'i', warning: '!', danger: '✕', critical: '✕' };

  // ---------------------------------------------------------------------------
  // TOAST
  // ---------------------------------------------------------------------------
  function toast(message, options = {}) {
    const severity = options.severity || 'info';
    const title = options.title || '';
    const timeout = options.timeout != null ? options.timeout : 4000;

    const container = document.getElementById('toast-container');
    if (!container) return;

    const node = document.createElement('div');
    node.className = `toast ${severity}`;
    node.innerHTML = `
      <div class="toast-icon">${ICONS[severity] || 'i'}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title"></div>` : ''}
        <div class="toast-message"></div>
      </div>
    `;
    if (title) node.querySelector('.toast-title').textContent = title;
    node.querySelector('.toast-message').textContent = message;
    container.appendChild(node);

    if (timeout > 0) {
      setTimeout(() => {
        node.style.opacity = '0';
        node.style.transform = 'translateX(40px)';
        node.style.transition = 'all 0.25s';
        setTimeout(() => node.remove(), 250);
      }, timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // MODAL
  // ---------------------------------------------------------------------------
  function openModal({ title, bodyHtml, footerHtml, size, onOpen }) {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = document.getElementById('modal');
    if (!backdrop || !modal) return;

    modal.classList.toggle('lg', size === 'lg');
    document.getElementById('modal-title').textContent = title || '';
    document.getElementById('modal-body').innerHTML = bodyHtml || '';
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    backdrop.classList.add('open');
    if (typeof onOpen === 'function') {
      // wait a tick so DOM is committed
      setTimeout(onOpen, 0);
    }
  }
  function closeModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
  }

  // ---------------------------------------------------------------------------
  // FORMATTERS
  // ---------------------------------------------------------------------------
  function formatUZS(amount) {
    const n = Math.round(Number(amount) || 0);
    return n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' UZS';
  }

  function formatDuration(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return '—';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const parts = [];
    if (days > 0) parts.push(`${days} kun`);
    if (hours > 0) parts.push(`${hours} soat`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins} daq`);
    return parts.join(' ');
  }

  function formatDateTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleString('uz-UZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function formatTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ---------------------------------------------------------------------------
  // STATUS PILLS / TRANSLATIONS
  // ---------------------------------------------------------------------------
  const STATUS_LABELS = {
    available:         'Bo\'sh',
    occupied:          'Band',
    cleaning_required: 'Tozalash kerak',
    cleaning:          'Tozalanmoqda',
    inspection:        'Tekshiruvda',
    maintenance:       'Texnik xizmat',
    // Eski nomlar (data.json eski bo'lsa)
    clean:             'Bo\'sh',
    dirty:             'Tozalash kerak',
    cleaned:           'Tekshiruvda',
  };
  const ROOM_TYPE_LABELS = {
    single: 'Single', double: 'Double', suite: 'Suite', accessible: 'Imkoniyatli',
  };
  const URGENCY_LABELS = {
    critical: 'Kritik', high: 'Yuqori', normal: 'Normal', low: 'Past',
  };
  const ORDER_STATUS_LABELS = {
    received: 'Qabul qilindi', preparing: 'Tayyorlanmoqda',
    delivering: 'Yetkazilmoqda', delivered: 'Yetkazildi', cancelled: 'Bekor qilingan',
  };
  const MAINT_STATUS_LABELS = {
    open: 'Yangi',
    acknowledged: 'Qabul qilindi',
    in_progress: 'Bajarilmoqda',
    resolved: 'Hal qilindi',
  };

  function statusPill(status) {
    return `<span class="status-pill status-${status}">${STATUS_LABELS[status] || status}</span>`;
  }
  function priorityPill(urgency) {
    return `<span class="status-pill priority-${urgency}">${URGENCY_LABELS[urgency] || urgency}</span>`;
  }
  function orderStatusPill(status) {
    return `<span class="status-pill status-${status === 'delivered' ? 'clean' : status === 'cancelled' ? 'maintenance' : 'cleaning'}">${ORDER_STATUS_LABELS[status] || status}</span>`;
  }
  function maintStatusPill(status) {
    const cls = status === 'resolved' ? 'status-clean'
              : status === 'in_progress' ? 'status-cleaning'
              : status === 'acknowledged' ? 'priority-high'
              : 'priority-critical'; // open
    return `<span class="status-pill ${cls}">${MAINT_STATUS_LABELS[status] || status}</span>`;
  }

  // ---------------------------------------------------------------------------
  // WEBSOCKET CLIENT
  // ---------------------------------------------------------------------------
  function connectWS({ token, onEvent, onOpen, onClose }) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    let socket = null;
    let reconnectTimer = null;
    let manualClose = false;
    const indicator = document.getElementById('ws-indicator');

    function setIndicator(state) {
      if (!indicator) return;
      indicator.className = `connection-indicator ${state}`;
      indicator.innerHTML = state === 'connected'
        ? '<span class="live-dot"></span> Real vaqtli'
        : '<span class="live-dot" style="background:#DC2626"></span> Uzilgan';
    }

    function open() {
      socket = new WebSocket(url);
      socket.onopen = () => {
        setIndicator('connected');
        if (typeof onOpen === 'function') onOpen();
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event' && typeof onEvent === 'function') onEvent(msg);
        } catch (_) { /* */ }
      };
      socket.onclose = () => {
        setIndicator('disconnected');
        if (typeof onClose === 'function') onClose();
        if (!manualClose) {
          reconnectTimer = setTimeout(open, 2000);
        }
      };
      socket.onerror = () => { /* onclose will fire */ };
    }

    open();

    return {
      close() {
        manualClose = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (socket) socket.close();
      },
      send(data) {
        if (socket && socket.readyState === 1) socket.send(JSON.stringify(data));
      },
    };
  }

  // ---------------------------------------------------------------------------
  // HTML ESCAPE
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------
  window.HotelOS = window.HotelOS || {};
  window.HotelOS.UI = {
    toast, openModal, closeModal,
    formatUZS, formatDuration, formatDateTime, formatTime,
    statusPill, priorityPill, orderStatusPill, maintStatusPill,
    STATUS_LABELS, ROOM_TYPE_LABELS, URGENCY_LABELS, ORDER_STATUS_LABELS, MAINT_STATUS_LABELS,
    connectWS, escapeHtml,
  };

  // Modal close bindings (delegated)
  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('modal-close');
    const backdrop = document.getElementById('modal-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  });
})();
