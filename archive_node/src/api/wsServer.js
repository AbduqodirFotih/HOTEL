/**
 * wsServer.js
 * --------------------------------------------------------------------------
 * WebSocket server. Brokerga obuna bo'ladi va har bir ulangan mijozga
 * uning ROLIGA mos sanitize qilingan xabar yuboradi.
 *
 * Xavfsizlik:
 *   - Faqat tokenlashtirilgan ulanishlar xabarlarni qabul qiladi
 *   - Har bir mijoz uchun rol saqlanadi (ws.session)
 *   - Narxlar va shaxsiy ismlar rolga qarab olib tashlanadi
 * --------------------------------------------------------------------------
 */

'use strict';

const WebSocket = require('ws');
const url = require('url');
const broker = require('../broker/messageBroker');
const auth = require('../utils/auth');
const logger = require('../utils/logger');

const FORWARDED_TOPICS = [
  'guest.checked_in',
  'guest.checked_out',
  'room.status_changed',
  'room.cleaning_required',
  'order.created',
  'order.status_changed',
  'maintenance.reported',
  'maintenance.status_changed',
  'notification.created',
];

/**
 * Xabar yukini ma'lum bir rolga mos qilib tozalash.
 * Bu func har bir mijoz uchun alohida chaqiriladi.
 */
function sanitizePayloadForRole(topic, payload, role) {
  const perms = auth.getPermissions(role);
  if (!perms) return null; // noma'lum rol — xabar yubormaymiz

  const p = JSON.parse(JSON.stringify(payload || {}));

  // Mehmon ismlari — faqat seeGuestNames ruxsati bilan
  if (p.guest && !perms.seeGuestNames) {
    p.guest = {
      id: p.guest.id,
      initials: (p.guest.name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
      roomNumber: p.guest.roomNumber,
    };
  } else if (p.guest && perms.seeGuestNames) {
    p.guest = {
      id: p.guest.id,
      name: p.guest.name,
      roomNumber: p.guest.roomNumber,
    };
  }

  // Bill — narx ko'ra oladiganlar uchun summa, boshqalar uchun yo'q
  if (p.bill) {
    if (perms.seePrices) {
      p.bill = { total: p.bill.total, nights: p.bill.nights, currency: p.bill.currency, roomNumber: p.bill.roomNumber };
    } else {
      delete p.bill;
    }
  }

  // Order — narxsiz versiya
  if (p.order && !perms.seePrices) {
    p.order = {
      id: p.order.id,
      roomNumber: p.order.roomNumber,
      status: p.order.status,
      items: (p.order.items || []).map((it) => ({
        name: it.name, quantity: it.quantity,
      })),
    };
  }

  // Xona narxi
  if (p.room && !perms.seePrices) {
    const r = { ...p.room };
    delete r.nightlyRate;
    p.room = r;
  }

  return p;
}

function topicAllowedForRole(topic, role) {
  // notification.created — barcha rollar oladi (faqat o'z roliga tegishlilari)
  // boshqalari ham odatda umumiy ma'lumot
  // events.* — texnik ma'lumot, faqat menejer
  // (hozir hech qaysi WS hodisani rolga qarab bloklamaymiz, faqat tozalaymiz)
  return true;
}

function attach(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  const clients = new Set();

  for (const topic of FORWARDED_TOPICS) {
    broker.subscribe(topic, (event) => {
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN || !client.authenticated) continue;
        if (!topicAllowedForRole(topic, client.session.role)) continue;
        const payload = sanitizePayloadForRole(topic, event.payload, client.session.role);
        if (payload === null) continue;
        try {
          client.send(JSON.stringify({
            type: 'event',
            topic: event.topic,
            payload,
            at: event.publishedAt,
          }));
        } catch (_) { /* mijoz uzilgan */ }
      }
    });
  }

  // Heartbeat
  setInterval(() => {
    const ts = JSON.stringify({ type: 'heartbeat', at: Date.now() });
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN && c.authenticated) {
        try { c.send(ts); } catch (_) {}
      }
    }
  }, 10000);

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    ws.authenticated = false;
    ws.session = null;

    const parsed = url.parse(req.url, true);
    const tokenFromQuery = parsed.query?.token;
    if (tokenFromQuery) {
      const session = auth.validateToken(tokenFromQuery);
      if (session) {
        ws.authenticated = true;
        ws.session = session;
        ws.send(JSON.stringify({ type: 'auth_ok', role: session.role }));
        logger.debug(`[WS] Ulanish autentifikatsiyalandi (${session.username}, ${session.role})`);
      } else {
        ws.send(JSON.stringify({ type: 'auth_required' }));
      }
    } else {
      ws.send(JSON.stringify({ type: 'auth_required' }));
    }

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }

      if (msg.type === 'auth' && msg.token) {
        const session = auth.validateToken(msg.token);
        if (session) {
          ws.authenticated = true;
          ws.session = session;
          ws.send(JSON.stringify({ type: 'auth_ok', role: session.role }));
          logger.debug(`[WS] Ulanish autentifikatsiyalandi (msg, ${session.role})`);
        } else {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Token noto\'g\'ri' }));
        }
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', at: Date.now() }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.debug('[WS] Mijoz uzilgan');
    });

    ws.on('error', (err) => {
      logger.warn('[WS] Xato:', err.message);
    });
  });

  logger.info('[WS] WebSocket server ishga tushdi (/ws)');
  return wss;
}

module.exports = { attach };
