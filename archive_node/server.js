/**
 * server.js
 * ============================================================================
 * HotelOS — Asosiy server.
 *
 * Bitta jarayon ichida quyidagi komponentlarni ishga tushiradi:
 *   - Xabar brokeri (in-memory pub/sub)
 *   - 4 ta mikroservis (Reception, Housekeeping, Room, Maintenance)
 *   - Bildirishnoma servisi (12 soatlik tozalash tsikli)
 *   - Express REST API (/api)
 *   - WebSocket server (/ws)
 *   - Statik frontend (/)
 *
 * Eslatma: servislar bir-birini to'g'ridan-to'g'ri chaqirmaydi — bir jarayonda
 * ishlasalar ham, ular faqat broker orqali muloqot qiladi. Bu mikroservis
 * arxitekturasining asosiy tamoyili.
 * ============================================================================
 */

'use strict';

const http = require('http');
const path = require('path');
const express = require('express');

const logger = require('./src/utils/logger');

// Servislarni ishga tushiramiz (require qilingan paytda init bo'ladi)
require('./src/services/receptionService');
require('./src/services/housekeepingService');
require('./src/services/roomService');
require('./src/services/maintenanceService');
require('./src/services/notificationService');

const apiRoutes = require('./src/api/routes');
const testRoutes = require('./src/api/testRoutes');
const wsServer = require('./src/api/wsServer');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// JSON body parser (32kb chegara — DoS himoyasi)
app.use(express.json({ limit: '32kb' }));

// Asosiy xavfsizlik sarlavhalari
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Oddiy so'rov jurnali (faqat API)
app.use('/api', (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    if (res.statusCode >= 400) {
      logger.warn(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    } else {
      logger.debug(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

// API yo'llari
app.use('/api', apiRoutes);
app.use('/api/tests', testRoutes);

// Statik frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — barcha noma'lum yo'llarni index.html ga yo'naltirish
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Yagona xato handler (oxirgi himoya)
app.use((err, req, res, next) => {
  logger.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Server xatosi yuz berdi.' });
});

const server = http.createServer(app);
wsServer.attach(server);

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                      HotelOS ishga tushdi                        ║
║                                                                  ║
║  Web panel:   http://localhost:${PORT}                              ║
║  WebSocket:   ws://localhost:${PORT}/ws                             ║
║  REST API:    http://localhost:${PORT}/api                          ║
║                                                                  ║
║  Demo foydalanuvchilar:                                          ║
║    admin / admin123             (Bosh Menejer)                   ║
║    reception / reception123     (Qabul)                          ║
║    housekeeping / housekeeping123  (Tozalash)                    ║
║                                                                  ║
║  To'xtatish:  Ctrl + C                                           ║
╚══════════════════════════════════════════════════════════════════╝
`);
  logger.info(`HotelOS ${PORT}-portda tinglamoqda`);
});

// Toza chiqish
process.on('SIGINT', () => {
  logger.info('SIGINT qabul qilindi, server to\'xtatilmoqda...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  logger.info('SIGTERM qabul qilindi, server to\'xtatilmoqda...');
  server.close(() => process.exit(0));
});
