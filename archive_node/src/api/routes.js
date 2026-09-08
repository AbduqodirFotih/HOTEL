/**
 * routes.js
 * --------------------------------------------------------------------------
 * REST API endpointlari. Har bir endpoint requireAuth + requirePermission
 * orqali himoyalangan. Ruxsatlar src/utils/auth.js dagi POLICIES da
 * belgilangan.
 *
 * Xato boshqaruvi: ValidationError -> 400; ruxsat yo'q -> 403; topilmadi
 * -> 404; ichki xato -> umumlashtirilgan 500. Stek izlari oshkor etilmaydi.
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
const { requireAuth, requirePermission, sanitizeForRole } = auth;

/** Xatolar uchun yagona handler */
function handleError(res, err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  logger.error('[API] Ichki xato:', err.message);
  return res.status(500).json({ error: 'Ichki server xatosi. Iltimos, qayta urinib ko\'ring.' });
}

// ============================================================================
// AUTH (avtorizatsiya talab qilinmaydi)
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

router.post('/auth/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  auth.logout(token);
  res.json({ success: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    user: {
      username: req.session.username,
      role: req.session.role,
      displayName: req.session.displayName,
    },
    policy: auth.publicPolicy(req.session.role),
  });
});

// ============================================================================
// RECEPTION (Qabul)
// ============================================================================

router.post('/reception/checkin', requireAuth, requirePermission('reception.checkin'), (req, res) => {
  try {
    const data = validateCheckIn(req.body);
    const result = reception.checkIn(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/reception/checkout/:roomNumber', requireAuth, requirePermission('reception.checkout'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = reception.checkOut(roomNumber, req.body || {});
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.get('/reception/inventory', requireAuth, requirePermission('reception.inventory'), (req, res) => {
  res.json(sanitizeForRole(reception.getInventory(), req.session.role));
});

// ============================================================================
// HOUSEKEEPING (Tozalash)
// ============================================================================

router.get('/housekeeping/queue', requireAuth, requirePermission('housekeeping.queue.view'), (req, res) => {
  res.json({ queue: housekeeping.getQueue() });
});

router.post('/housekeeping/start/:roomNumber', requireAuth, requirePermission('housekeeping.start'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.startCleaning(roomNumber, req.session.displayName || req.session.username);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/housekeeping/complete/:roomNumber', requireAuth, requirePermission('housekeeping.complete'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.markClean(roomNumber, req.session.displayName || req.session.username);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/housekeeping/queue/:roomNumber', requireAuth, requirePermission('housekeeping.enqueue'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.addToCleaningQueue(roomNumber, 'manual');
    if (!result) return res.status(409).json({ error: 'Xona navbatga qo\'shilmadi (allaqachon navbatda yoki band)' });
    res.json({ success: true, entry: result });
  } catch (err) { handleError(res, err); }
});

// ============================================================================
// RECEPTION QO'SHIMCHA AMALLARI (tasdiqlash, qo'lda belgilash)
// ============================================================================

router.post('/reception/confirm-available/:roomNumber', requireAuth, requirePermission('reception.confirm_available'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = reception.confirmAvailable(roomNumber);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/reception/mark-needs-cleaning/:roomNumber', requireAuth, requirePermission('reception.mark_needs_cleaning'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = reception.markNeedsCleaning(roomNumber);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

// ============================================================================
// ROOM SERVICE (Xona Xizmati)
// ============================================================================

router.get('/orders', requireAuth, requirePermission('orders.view'), (req, res) => {
  const data = { orders: store.getOrders().slice().reverse() };
  res.json(sanitizeForRole(data, req.session.role));
});

router.get('/orders/active', requireAuth, requirePermission('orders.view'), (req, res) => {
  const data = { orders: roomService.getActiveOrders() };
  res.json(sanitizeForRole(data, req.session.role));
});

router.post('/orders', requireAuth, requirePermission('orders.create'), (req, res) => {
  try {
    const data = validateOrder(req.body);
    const result = roomService.createOrder(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/orders/:id/advance', requireAuth, requirePermission('orders.advance'), (req, res) => {
  const result = roomService.advanceOrder(req.params.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.post('/orders/:id/cancel', requireAuth, requirePermission('orders.cancel'), (req, res) => {
  const result = roomService.cancelOrder(req.params.id, req.body?.reason);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.get('/menu', requireAuth, requirePermission('orders.menu'), (req, res) => {
  res.json({ menu: store.getMenu() });
});

// ============================================================================
// MAINTENANCE (Texnik Xizmat)
// ============================================================================

router.get('/maintenance', requireAuth, requirePermission('maintenance.view'), (req, res) => {
  res.json({ requests: maintenance.getAll().slice().reverse() });
});

router.get('/maintenance/queue', requireAuth, requirePermission('maintenance.view'), (req, res) => {
  res.json({ queue: maintenance.getQueue() });
});

router.post('/maintenance', requireAuth, requirePermission('maintenance.report'), (req, res) => {
  try {
    const data = validateMaintenance(req.body);
    const result = maintenance.report(data, req.session.displayName || req.session.username);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/maintenance/:id/acknowledge', requireAuth, requirePermission('maintenance.acknowledge'), (req, res) => {
  const result = maintenance.acknowledge(req.params.id, req.session.displayName || req.session.username);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.post('/maintenance/:id/start', requireAuth, requirePermission('maintenance.start'), (req, res) => {
  const result = maintenance.start(req.params.id, req.session.displayName || req.session.username);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.post('/maintenance/:id/resolve', requireAuth, requirePermission('maintenance.resolve'), (req, res) => {
  const result = maintenance.resolve(req.params.id, req.body?.notes || '', req.session.displayName || req.session.username);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

// ============================================================================
// MANAGER — Eslatma yuborish (faqat ogohlantirish, ish bajarmaydi)
// ============================================================================

/**
 * Bosh menejer tozalovchiga eslatma yuboradi: "vaqtida ish qiling".
 * Bu xona statusini o'zgartirmaydi — faqat bildirishnoma yaratadi va
 * tozalovchi rolida ishlayotgan barcha foydalanuvchilarga tarqatadi.
 */
router.post('/manager/remind/housekeeping/:roomNumber', requireAuth, requirePermission('manager.remind_housekeeping'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const room = store.getRoom(roomNumber);
    if (!room) return res.status(404).json({ error: `${roomNumber}-xona topilmadi` });
    const sender = req.session.displayName || req.session.username;
    const reminderMsg = req.body?.message?.trim() || 'Iltimos, ushbu xonani vaqtida tozalang';

    broker.publish('notification.created', {
      type: 'manager_reminder',
      severity: 'warning',
      targetRole: 'housekeeping',
      message: `🔔 ${sender}dan eslatma: ${roomNumber}-xona — ${reminderMsg}`,
      roomNumber,
      sender,
    });

    broker.publish('manager.reminder_sent', {
      target: 'housekeeping',
      roomNumber,
      sender,
      message: reminderMsg,
      sentAt: Date.now(),
    });

    logger.info(`[MANAGER] ${sender} -> housekeeping eslatmasi (xona ${roomNumber})`);
    res.json({ success: true, sent: { to: 'housekeeping', roomNumber, message: reminderMsg } });
  } catch (err) { handleError(res, err); }
});

/**
 * Bosh menejer texnikka eslatma yuboradi: "muammoni hal qil".
 * Bu so'rovni qabul qilmaydi yoki bajarmaydi — faqat bildirishnoma.
 */
router.post('/manager/remind/maintenance/:id', requireAuth, requirePermission('manager.remind_maintenance'), (req, res) => {
  const requestId = req.params.id;
  const request = maintenance.getById(requestId);
  if (!request) return res.status(404).json({ error: `So'rov ${requestId} topilmadi` });

  const sender = req.session.displayName || req.session.username;
  const reminderMsg = req.body?.message?.trim() || 'Iltimos, muammoni tezroq hal qiling';

  broker.publish('notification.created', {
    type: 'manager_reminder',
    severity: 'warning',
    targetRole: 'maintenance',
    message: `🔔 ${sender}dan eslatma: ${request.roomNumber}-xona texnik so'rovi — ${reminderMsg}`,
    roomNumber: request.roomNumber,
    requestId,
    sender,
  });

  broker.publish('manager.reminder_sent', {
    target: 'maintenance',
    requestId,
    roomNumber: request.roomNumber,
    sender,
    message: reminderMsg,
    sentAt: Date.now(),
  });

  logger.info(`[MANAGER] ${sender} -> maintenance eslatmasi (so'rov ${requestId})`);
  res.json({ success: true, sent: { to: 'maintenance', requestId, message: reminderMsg } });
});

/** Manager statistika va tarixni ko'rish — fake data + jonli ma'lumotlar */
router.get('/manager/history', requireAuth, requirePermission('history.view'), (req, res) => {
  res.json({
    bookings: store.getBookingHistory(),
    maintenanceHistory: store.getMaintenanceHistory(),
    cleaningHistory: store.getCleaningHistory(),
    staffPerformance: store.getStaffPerformance(),
  });
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

router.get('/notifications', requireAuth, requirePermission('notifications.view'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ notifications: store.getNotifications(limit) });
});

router.post('/notifications/:id/read', requireAuth, requirePermission('notifications.modify'), (req, res) => {
  store.markNotificationRead(req.params.id);
  res.json({ success: true });
});

router.post('/notifications/clear-read', requireAuth, requirePermission('notifications.modify'), (req, res) => {
  store.clearReadNotifications();
  res.json({ success: true });
});

// ============================================================================
// SETTINGS
// ============================================================================

router.get('/settings', requireAuth, requirePermission('settings.view'), (req, res) => {
  res.json({ settings: store.getSettings() });
});

router.put('/settings', requireAuth, requirePermission('settings.update'), (req, res) => {
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

router.post('/settings/reset-data', requireAuth, requirePermission('settings.reset'), (req, res) => {
  store.reset();
  res.json({ success: true });
});

// ============================================================================
// DASHBOARD SUMMARY (rolga qarab tozalanadi)
// ============================================================================

router.get('/dashboard/summary', requireAuth, requirePermission('dashboard.view'), (req, res) => {
  const inv = reception.getInventory();
  const payload = {
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
  };
  res.json(sanitizeForRole(payload, req.session.role));
});

router.get('/events/recent', requireAuth, requirePermission('events.view'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ events: broker.getRecentEvents(limit) });
});

router.get('/broker/topics', requireAuth, requirePermission('events.view'), (req, res) => {
  res.json({ topics: broker.listTopics() });
});

module.exports = router;
