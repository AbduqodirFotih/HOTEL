/**
 * routes.js
 * --------------------------------------------------------------------------
 * REST API endpointlari. Har bir endpointda 2 qatlam himoya:
 *   1) requireAuth        — token tekshirish (401)
 *   2) requirePermission  — aniq amal huquqi (403)
 *
 * Ma'lumotlar ham rol bo'yicha tozalanadi: tozalovchi xona narxini ko'rmaydi,
 * mehmon ismini ko'rmaydi. Bu defense-in-depth — hatto frontend xato bo'lsa
 * ham, server hech qachon ortiqcha ma'lumot bermaydi.
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

function handleError(res, err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  logger.error('[API] Ichki xato:', err.message);
  return res.status(500).json({ error: 'Ichki server xatosi. Iltimos, qayta urinib ko\'ring.' });
}

// ============================================================================
// AUTH (rolsiz — har kim foydalanishi mumkin)
// ============================================================================

router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = validateLogin(req.body);
    const result = auth.login(username, password);
    if (!result) {
      return res.status(401).json({ error: 'Foydalanuvchi nomi yoki parol noto\'g\'ri' });
    }
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/auth/logout', auth.requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  auth.logout(token);
  res.json({ success: true });
});

router.get('/auth/me', auth.requireAuth, (req, res) => {
  res.json({
    user: {
      username: req.session.username,
      role: req.session.role,
      displayName: req.session.displayName,
      permissions: auth.getPermissions(req.session.role),
    },
  });
});

// ============================================================================
// RECEPTION — faqat manager va reception
// ============================================================================

router.post('/reception/checkin', auth.requireAuth, auth.requirePermission('canCheckIn'), (req, res) => {
  try {
    const data = validateCheckIn(req.body);
    const result = reception.checkIn(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/reception/checkout/:roomNumber', auth.requireAuth, auth.requirePermission('canCheckOut'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = reception.checkOut(roomNumber, req.body || {});
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.get('/reception/inventory', auth.requireAuth, (req, res) => {
  const inv = reception.getInventory();
  const rooms = inv.rooms.map((r) => auth.sanitizeRoomForRole(r, req.session.role));
  res.json({ rooms, summary: inv.summary });
});

// ============================================================================
// HOUSEKEEPING — faqat manager va housekeeping
// ============================================================================

router.get('/housekeeping/queue', auth.requireAuth, auth.requireRole('manager', 'reception', 'housekeeping'), (req, res) => {
  res.json({ queue: housekeeping.getQueue() });
});

router.post('/housekeeping/start/:roomNumber', auth.requireAuth, auth.requirePermission('canCleanRoom'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.startCleaning(roomNumber);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/housekeeping/complete/:roomNumber', auth.requireAuth, auth.requirePermission('canCleanRoom'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.markClean(roomNumber);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/housekeeping/queue/:roomNumber', auth.requireAuth, auth.requirePermission('canCleanRoom'), (req, res) => {
  try {
    const roomNumber = validateRoomNumber(req.params.roomNumber);
    const result = housekeeping.addToCleaningQueue(roomNumber, 'manual');
    if (!result) return res.status(409).json({ error: 'Xona navbatga qo\'shilmadi' });
    res.json({ success: true, entry: result });
  } catch (err) { handleError(res, err); }
});

// ============================================================================
// ROOM SERVICE (Xona xizmati) — manager va reception
// ============================================================================

router.get('/orders', auth.requireAuth, auth.requireRole('manager', 'reception'), (req, res) => {
  const orders = store.getOrders().slice().reverse()
    .map((o) => auth.sanitizeOrderForRole(o, req.session.role));
  res.json({ orders });
});

router.get('/orders/active', auth.requireAuth, auth.requireRole('manager', 'reception'), (req, res) => {
  const orders = roomService.getActiveOrders()
    .map((o) => auth.sanitizeOrderForRole(o, req.session.role));
  res.json({ orders });
});

router.post('/orders', auth.requireAuth, auth.requirePermission('canCreateOrder'), (req, res) => {
  try {
    const data = validateOrder(req.body);
    const result = roomService.createOrder(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/orders/:id/advance', auth.requireAuth, auth.requirePermission('canAdvanceOrder'), (req, res) => {
  const result = roomService.advanceOrder(req.params.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.post('/orders/:id/cancel', auth.requireAuth, auth.requirePermission('canAdvanceOrder'), (req, res) => {
  const result = roomService.cancelOrder(req.params.id, req.body?.reason);
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

router.get('/menu', auth.requireAuth, auth.requireRole('manager', 'reception'), (req, res) => {
  res.json({ menu: store.getMenu() });
});

// ============================================================================
// MAINTENANCE — manager, reception (xabar berish), maintenance
// ============================================================================

router.get('/maintenance', auth.requireAuth, auth.requireRole('manager', 'reception', 'maintenance'), (req, res) => {
  res.json({ requests: maintenance.getAll().slice().reverse() });
});

router.get('/maintenance/queue', auth.requireAuth, auth.requireRole('manager', 'reception', 'maintenance'), (req, res) => {
  res.json({ queue: maintenance.getQueue() });
});

router.post('/maintenance', auth.requireAuth, auth.requirePermission('canReportMaintenance'), (req, res) => {
  try {
    const data = validateMaintenance(req.body);
    const result = maintenance.report(data);
    if (!result.success) return res.status(409).json({ error: result.error });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

router.post('/maintenance/:id/resolve', auth.requireAuth, auth.requirePermission('canResolveMaintenance'), (req, res) => {
  const result = maintenance.resolve(req.params.id, req.body?.notes || '');
  if (!result.success) return res.status(409).json({ error: result.error });
  res.json(result);
});

// ============================================================================
// NOTIFICATIONS — barcha autentifikatsiyalangan foydalanuvchilar (faqat o'ziniki)
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
// SETTINGS — faqat manager
// ============================================================================

router.get('/settings', auth.requireAuth, (req, res) => {
  res.json({ settings: store.getSettings() });
});

router.put('/settings', auth.requireAuth, auth.requirePermission('canChangeSettings'), (req, res) => {
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

router.post('/settings/reset-data', auth.requireAuth, auth.requirePermission('canResetData'), (req, res) => {
  store.reset();
  res.json({ success: true });
});

// ============================================================================
// DASHBOARD — barcha rollar, lekin ma'lumot rolga moslab tozalanadi
// ============================================================================

router.get('/dashboard/summary', auth.requireAuth, (req, res) => {
  const role = req.session.role;
  const perms = auth.getPermissions(role);
  const inv = reception.getInventory();

  // Xonalar — narx rolga qarab yashiriladi
  const rooms = inv.rooms.map((r) => auth.sanitizeRoomForRole(r, role));

  // Mehmonlar — ism ko'rinishi rolga bog'liq
  const guests = store.getGuests().map((g) => auth.sanitizeGuestForRole(g, role));

  // Buyurtmalar — faqat narxlarni ko'ra oladiganlar uchun
  const activeOrders = perms.canCreateOrder || perms.canAdvanceOrder
    ? roomService.getActiveOrders().map((o) => auth.sanitizeOrderForRole(o, role))
    : [];

  // Texnik xizmat — barcha rollar ko'radi (lekin ba'zilari faqat o'qiy oladi)
  const openMaintenance = ['manager', 'reception', 'maintenance'].includes(role)
    ? maintenance.getQueue()
    : [];

  // Tozalash navbati — manager va housekeeping
  const cleaningQueue = ['manager', 'reception', 'housekeeping'].includes(role)
    ? housekeeping.getQueue()
    : [];

  // Hodisalar jurnali — faqat manager
  const recentEvents = perms.canViewEvents
    ? broker.getRecentEvents(20)
    : [];

  // Daromad statistikasi — faqat manager
  const stats = perms.seeRevenue
    ? store.getStats()
    : { totalCheckIns: store.getStats().totalCheckIns, totalCheckOuts: store.getStats().totalCheckOuts };

  // Menyu — faqat order yaratish huquqi bor bo'lganlar
  const menu = perms.canCreateOrder ? store.getMenu() : [];

  res.json({
    role,
    permissions: perms,
    rooms,
    summary: inv.summary,
    activeOrders,
    openMaintenance,
    cleaningQueue,
    notifications: store.getNotifications(20),
    guests,
    stats,
    recentEvents,
    menu,
    technicians: ['manager', 'maintenance'].includes(role) ? store.getTechnicians() : [],
    housekeepers: ['manager', 'housekeeping'].includes(role) ? store.getHousekeepers() : [],
    settings: store.getSettings(),
    serverTime: Date.now(),
  });
});

router.get('/events/recent', auth.requireAuth, auth.requirePermission('canViewEvents'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ events: broker.getRecentEvents(limit) });
});

router.get('/broker/topics', auth.requireAuth, auth.requirePermission('canViewEvents'), (req, res) => {
  res.json({ topics: broker.listTopics() });
});

module.exports = router;
