/**
 * wsServer.js
 * --------------------------------------------------------------------------
 * WebSocket server. Brokerga obuna bo'ladi va barcha ulangan mijozlarga
 * jonli xabarlarni uzatadi. Avtorizatsiya: ulanish vaqtida ?token=...
 * yoki ulanishdan keyin {type:"auth", token: "..."} xabari talab qilinadi.
 *
 * Xavfsizlik: maxfiy ma'lumotlar (to'liq mehmon ismi, to'lov tafsilotlari)
 * WebSocket orqali tarqalmaydi — faqat anonim/qisqartirilgan ma'lumotlar.
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

/** Klientga yuborish uchun xabardan maxfiy maydonlarni olib tashlaymiz */
function sanitizePayload(topic, payload) {
  const p = JSON.parse(JSON.stringify(payload || {}));
  // Mehmon ma'lumotlarini qisqartirish — to'liq ism o'rniga bosh harflar
  if (p.guest) {
    p.guest = {
      id: p.guest.id,
      initials: (p.guest.name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
      roomNumber: p.guest.roomNumber,
    };
  }
  // Hisobotda to'liq summani saqlaymiz, lekin xom tafsilotlarni olib tashlaymiz
  if (p.bill) {
    p.bill = {
      total: p.bill.total,
      nights: p.bill.nights,
      currency: p.bill.currency,
      roomNumber: p.bill.roomNumber,
    };
  }
  return p;
}

function attach(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  const clients = new Set();

  // Brokerdagi har bir mavzuga obuna bo'lib, klientlarga uzatamiz
  for (const topic of FORWARDED_TOPICS) {
    broker.subscribe(topic, (event) => {
      const msg = JSON.stringify({
        type: 'event',
        topic: event.topic,
        payload: sanitizePayload(event.topic, event.payload),
        at: event.publishedAt,
      });
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN && client.authenticated) {
          try { client.send(msg); } catch (err) { /* mijoz uzilgan */ }
        }
      }
    });
  }

  // Har 10 sekundda heartbeat
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

    // Token URL query orqali kelishi mumkin
    const parsed = url.parse(req.url, true);
    const tokenFromQuery = parsed.query?.token;
    if (tokenFromQuery && auth.validateToken(tokenFromQuery)) {
      ws.authenticated = true;
      ws.send(JSON.stringify({ type: 'auth_ok' }));
      logger.debug('[WS] Ulanish autentifikatsiyalandi (query)');
    } else {
      ws.send(JSON.stringify({ type: 'auth_required' }));
    }

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (_) { return; }

      if (msg.type === 'auth' && msg.token) {
        if (auth.validateToken(msg.token)) {
          ws.authenticated = true;
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          logger.debug('[WS] Ulanish autentifikatsiyalandi (msg)');
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
