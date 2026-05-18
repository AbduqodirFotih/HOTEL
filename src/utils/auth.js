/**
 * auth.js
 * --------------------------------------------------------------------------
 * Autentifikatsiya va Rolga Asoslangan Kirish Nazorati (RBAC).
 *
 * Ish jarayoni:
 *   1) Login -> validation -> token yaratiladi (8 soat TTL)
 *   2) Har bir API so'rovi tokenni tekshiradi (requireAuth)
 *   3) Maxfiy operatsiyalar uchun rol ham tekshiriladi (requireRole)
 *
 * Asosiy mantiq: 4 ta xodim bo'limi = 4 ta rol. Har biri o'z bo'limi
 * doirasida ishlaydi. Xato kirishlarga 403 qaytariladi (raw stack izi yo'q).
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const logger = require('./logger');

const SALT = 'hotelos-pdp-2026';
function hashPassword(plain) {
  return crypto.createHash('sha256').update(SALT + plain).digest('hex');
}

// ============================================================================
// 4 ta demo foydalanuvchi — har biri o'z bo'limini boshqaradi
// ============================================================================
const USERS = [
  { username: 'admin',        passwordHash: hashPassword('admin123'),        role: 'manager',      displayName: 'Bosh Menejer' },
  { username: 'reception',    passwordHash: hashPassword('reception123'),    role: 'reception',    displayName: 'Qabul Xodimi' },
  { username: 'housekeeping', passwordHash: hashPassword('housekeeping123'), role: 'housekeeping', displayName: 'Tozalash Xodimi' },
  { username: 'maintenance',  passwordHash: hashPassword('maintenance123'),  role: 'maintenance',  displayName: 'Texnik Xodim' },
];

// ============================================================================
// ROL HUQUQLARI MATRITSASI
// Tizimda kim nimani qila olishi mantiqi shu yerda. Backend ham, frontend ham
// shu manbadan foydalanadi — bitta haqiqat manbai (single source of truth).
// ============================================================================
const ROLE_PERMISSIONS = {
  manager: {
    label: 'Bosh Menejer',
    color: '#C9A961', // shampan oltini
    pages: ['dashboard', 'rooms', 'reception', 'housekeeping', 'orders', 'maintenance', 'tests', 'events', 'architecture', 'settings'],
    seePrices: true,
    seeGuestNames: true,
    seeRevenue: true,
    canCheckIn: true,
    canCheckOut: true,
    canCreateOrder: true,
    canAdvanceOrder: true,
    canCleanRoom: true,
    canReportMaintenance: true,
    canResolveMaintenance: true,
    canChangeSettings: true,
    canResetData: true,
    canRunTests: true,
    canViewEvents: true,
  },
  reception: {
    label: 'Qabul Xodimi',
    color: '#4A6FA5', // tinch navy
    pages: ['dashboard', 'rooms', 'reception', 'orders', 'maintenance'],
    seePrices: true,
    seeGuestNames: true,
    seeRevenue: false,
    canCheckIn: true,
    canCheckOut: true,
    canCreateOrder: true,
    canAdvanceOrder: true,
    canCleanRoom: false,
    canReportMaintenance: true,
    canResolveMaintenance: false,
    canChangeSettings: false,
    canResetData: false,
    canRunTests: false,
    canViewEvents: false,
  },
  housekeeping: {
    label: 'Tozalash Xodimi',
    color: '#10B981', // ko'k-yashil (toza)
    pages: ['dashboard', 'rooms', 'housekeeping'],
    seePrices: false,        // narx ko'rmaydi
    seeGuestNames: false,    // mehmon ismi ko'rmaydi
    seeRevenue: false,
    canCheckIn: false,
    canCheckOut: false,
    canCreateOrder: false,
    canAdvanceOrder: false,
    canCleanRoom: true,      // asosiy vazifa
    canReportMaintenance: true, // tozalash vaqtida muammo topsa, xabar bera oladi
    canResolveMaintenance: false,
    canChangeSettings: false,
    canResetData: false,
    canRunTests: false,
    canViewEvents: false,
  },
  maintenance: {
    label: 'Texnik Xodim',
    color: '#F59E0B', // amber (texnik)
    pages: ['dashboard', 'rooms', 'maintenance'],
    seePrices: false,        // narx ko'rmaydi
    seeGuestNames: false,    // mehmon ismi ko'rmaydi
    seeRevenue: false,
    canCheckIn: false,
    canCheckOut: false,
    canCreateOrder: false,
    canAdvanceOrder: false,
    canCleanRoom: false,
    canReportMaintenance: true,  // o'zi qo'shimcha so'rov ham yarata oladi
    canResolveMaintenance: true, // asosiy vazifa
    canChangeSettings: false,
    canResetData: false,
    canRunTests: false,
    canViewEvents: false,
  },
};

function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || null;
}

function can(role, action) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms[action] === true;
}

// ============================================================================
// TOKEN BOSHQARUVI
// ============================================================================
const tokens = new Map();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function login(username, password) {
  const user = USERS.find((u) => u.username === username);
  if (!user) {
    logger.warn(`[AUTH] Mavjud bo'lmagan foydalanuvchi urinishi: ${username}`);
    return null;
  }
  if (user.passwordHash !== hashPassword(password)) {
    logger.warn(`[AUTH] Noto'g'ri parol: ${username}`);
    return null;
  }
  const token = generateToken();
  tokens.set(token, {
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    issuedAt: Date.now(),
  });
  logger.info(`[AUTH] Tizimga kirdi: ${username} (${user.role})`);
  return {
    token,
    user: {
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      permissions: ROLE_PERMISSIONS[user.role],
    },
  };
}

function validateToken(token) {
  if (!token) return null;
  const session = tokens.get(token);
  if (!session) return null;
  if (Date.now() - session.issuedAt > TOKEN_TTL_MS) {
    tokens.delete(token);
    return null;
  }
  return session;
}

function logout(token) {
  return tokens.delete(token);
}

// ============================================================================
// EXPRESS MIDDLEWARE LAR
// ============================================================================

/** Token tekshirish — har qanday himoyalangan endpoint uchun birinchi qadam */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const session = validateToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
  req.session = session;
  next();
}

/**
 * Aniq harakat huquqini tekshiradi (masalan: canCheckIn).
 * Bu permission matritsasidan foydalanadi — yagona haqiqat manbai.
 *
 * Foydalanish:
 *   router.post('/reception/checkin', requireAuth, requirePermission('canCheckIn'), handler)
 */
function requirePermission(action) {
  return (req, res, next) => {
    if (!req.session) {
      return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    }
    if (!can(req.session.role, action)) {
      logger.warn(`[AUTH] ${req.session.username} (${req.session.role}) "${action}" ga urinish qildi — RAD ETILDI`);
      return res.status(403).json({
        error: 'Bu amal sizning rolingiz uchun ruxsat etilmagan',
        requiredPermission: action,
      });
    }
    next();
  };
}

/**
 * Aniq rollarga ruxsat beradi (oddiyroq variant).
 * Misol: requireRole('manager') — faqat menejer
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session) {
      return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    }
    if (!allowedRoles.includes(req.session.role)) {
      logger.warn(`[AUTH] ${req.session.username} (${req.session.role}) "${req.originalUrl}" ga urinish qildi — RAD ETILDI`);
      return res.status(403).json({ error: 'Bu sahifa sizning rolingiz uchun ruxsat etilmagan' });
    }
    next();
  };
}

// ============================================================================
// MA'LUMOTLARNI ROL BO'YICHA TOZALASH (defense in depth)
// Backend hech qachon narxlarni ruxsat etilmagan rolga yubormaydi —
// hatto frontend bug bo'lsa ham, ma'lumot tashqariga chiqmaydi.
// ============================================================================

function sanitizeRoomForRole(room, role) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return null;
  const safe = { ...room };
  if (!perms.seePrices) {
    delete safe.nightlyRate;
  }
  if (!perms.seeGuestNames && safe.occupiedBy) {
    // occupiedBy ID — uni saqlaymiz (anonim), lekin guest tafsilotini bermaymiz
  }
  return safe;
}

function sanitizeGuestForRole(guest, role) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return null;
  if (!perms.seeGuestNames) {
    // Ism o'rniga inisiallarni ko'rsatamiz (xavfsizlik)
    const initials = (guest.name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
    return {
      id: guest.id,
      roomNumber: guest.roomNumber,
      initials,
      checkInAt: guest.checkInAt,
      nights: guest.nights,
    };
  }
  return guest;
}

function sanitizeOrderForRole(order, role) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return null;
  if (!perms.seePrices) {
    // Narxsiz versiya
    const safe = { ...order };
    delete safe.total;
    safe.items = (order.items || []).map((it) => ({
      itemId: it.itemId, name: it.name, quantity: it.quantity,
      // unitPrice va lineTotal olib tashlanadi
    }));
    return safe;
  }
  return order;
}

module.exports = {
  login,
  logout,
  validateToken,
  requireAuth,
  requireRole,
  requirePermission,
  can,
  getPermissions,
  sanitizeRoomForRole,
  sanitizeGuestForRole,
  sanitizeOrderForRole,
  ROLE_PERMISSIONS,
  _users: USERS,
};
