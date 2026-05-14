/**
 * routes.js
 * --------------------------------------------------------------------------
 * REST API endpointlari. Frontend va tashqi tizimlar shu yerga so'rov yuboradi.
 * Barcha endpointlar autentifikatsiya talab qiladi (login bundan mustasno).
 *
 * Xato boshqaruvi: hech qachon stek izi qaytarilmaydi. ValidationError ->
 * 400; mavjud emas -> 404; ichki xato -> umumlashtirilgan "Server xatosi".
 * --------------------------------------------------------------------------
 */

'use strict';

const express = require('express');

const reception = require('../services/receptionService');
const housekeeping = require('../services/housekeepingService');
const roomService = require('../services/roomService');
const maintenance = require('../services/maintenanceService');
const broker = require('../broker/messageBroker');
const store = require('../data/store');
const auth = require('../utils/auth');
const logger = require('../utils/logger');
const {
  ValidationError,
  validateCheckIn,
  validateRoomNumber,
  validateOrder,
  validateMaintenance,
  validateLogin,
} = require('../utils/validator');

const router = express.Router();

/** Xatolar uchun yagona handler */
function handleError(res, err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  logger.error('[API] Ichki xato:', err.message);
  return res.status(500).json({ error: 'Ichki server xatosi. Iltimos, qayta urinib ko\'ring.' });
}

// ============================================================================
// AUTH
// ============================================================================

router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = validateLogin(req.body);
    const result = auth.login(username, password);
    if (!result) {
      return res.status(401).json({ error: 'Foydalanuvchi nomi yoki parol noto\'g\'ri' });
    }
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/auth/logout', auth.requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  auth.logout(token);
  res.json({ success: true });
});

router.get('/auth/me', auth.requireAuth, (req, res) => {
  res.json({ user: req.session });
});

// ============================================================================
// RECEPTION (Qabul)
// ============================================================================

router.post('/reception/checkin', auth.requireAuth, (req, res) => {
  try {
    const data = validateCheckIn(req.body);
    const result = reception.checkIn(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/reception/checkout/:roomNumber', auth.requireAuth, (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = reception.checkOut(roomNumber, req.body || {});
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/reception/inventory', auth.requireAuth, (req, res) => {
  res.json(reception.getInventory());
});

// ============================================================================
// HOUSEKEEPING (Tozalash)
// ============================================================================

router.get('/housekeeping/queue', auth.requireAuth, (req, res) => {
  res.json({ queue: housekeeping.getQueue() });
});

router.post('/housekeeping/start/:roomNumber', auth.requireAuth, (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.startCleaning(roomNumber);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/housekeeping/complete/:roomNumber', auth.requireAuth, (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.markClean(roomNumber);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/housekeeping/queue/:roomNumber', auth.requireAuth, (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.addToCleaningQueue(roomNumber, 'manual');
    if (!result) return res.status(409).json({ error: 'Xona navbatga qo\'shilmadi' });
    res.json({ success: true, entry: result });
  } catch (err) {
    handleError(res, err);
  }
});

// ============================================================================
// ROOM SERVICE (Xona Xizmati)
// ============================================================================

router.get('/orders', auth.requireAuth, (req, res) => {
  res.json({ orders: store.getOrders().slice().reverse() });
});

router.get('/orders/active', auth.requireAuth, (req, res) => {
  res.json({ orders: roomService.getActiveOrders() });
});

router.post('/orders', auth.requireAuth, (req, res) => {
  try {
    const data = validateOrder(req.body);
    const result = roomService.createOrder(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/orders/:id/advance', auth.requireAuth, (req, res) => {
  const result = roomService.advanceOrder(req.params.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.post('/orders/:id/cancel', auth.requireAuth, (req, res) => {
  const result = roomService.cancelOrder(req.params.id, req.body?.reason);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.get('/menu', auth.requireAuth, (req, res) => {
  res.json({ menu: store.getMenu() });
});

// ============================================================================
// MAINTENANCE (Texnik Xizmat)
// ============================================================================

router.get('/maintenance', auth.requireAuth, (req, res) => {
  res.json({ requests: maintenance.getAll().slice().reverse() });
});

router.get('/maintenance/queue', auth.requireAuth, (req, res) => {
  res.json({ queue: maintenance.getQueue() });
});

router.post('/maintenance', auth.requireAuth, (req, res) => {
  try {
    const data = validateMaintenance(req.body);
    const result = maintenance.report(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/maintenance/:id/resolve', auth.requireAuth, (req, res) => {
  const result = maintenance.resolve(req.params.id, req.body?.notes || '');
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

router.get('/notifications', auth.requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ notifications: store.getNotifications(limit) });
});

router.post('/notifications/:id/read', auth.requireAuth, (req, res) => {
  store.markNotificationRead(req.params.id);
  res.json({ success: true });
});

router.post('/notifications/clear-read', auth.requireAuth, (req, res) => {
  store.clearReadNotifications();
  res.json({ success: true });
});

// ============================================================================
// SETTINGS
// ============================================================================

router.get('/settings', auth.requireAuth, (req, res) => {
  res.json({ settings: store.getSettings() });
});

router.put('/settings', auth.requireAuth, (req, res) => {
  // Faqat ruxsat etilgan maydonlarni yangilash
  const allowed = [
    'cleaningThresholdHours', 'autoNotifyHousekeeping', 'notificationSound',
    'language', 'theme', 'density', 'currency', 'autoRefreshSec',
    'dashboardShowEvents', 'showRoomTimers',
  ];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  const settings = store.updateSettings(patch);
  res.json({ settings });
});

router.post('/settings/reset-data', auth.requireAuth, (req, res) => {
  if (req.session.role !== 'manager') {
    return res.status(403).json({ error: 'Faqat menejer barcha ma\'lumotlarni qayta tiklashi mumkin' });
  }
  store.reset();
  res.json({ success: true });
});

// ============================================================================
// DASHBOARD SUMMARY
// ============================================================================

router.get('/dashboard/summary', auth.requireAuth, (req, res) => {
  const inv = reception.getInventory();
  res.json({
    rooms: inv.rooms,
    summary: inv.summary,
    activeOrders: roomService.getActiveOrders(),
    openMaintenance: maintenance.getQueue(),
    cleaningQueue: housekeeping.getQueue(),
    notifications: store.getNotifications(20),
    guests: store.getGuests(),
    stats: store.getStats(),
    recentEvents: broker.getRecentEvents(20),
    menu: store.getMenu(),
    technicians: store.getTechnicians(),
    housekeepers: store.getHousekeepers(),
    settings: store.getSettings(),
    serverTime: Date.now(),
  });
});

router.get('/events/recent', auth.requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ events: broker.getRecentEvents(limit) });
});

router.get('/broker/topics', auth.requireAuth, (req, res) => {
  res.json({ topics: broker.listTopics() });
});

module.exports = router;
