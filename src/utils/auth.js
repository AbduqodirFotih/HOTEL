/**
 * auth.js
 * --------------------------------------------------------------------------
 * Token asosidagi autentifikatsiya + rolga asoslangan kirish nazorati (RBAC).
 *
 * 4 ta rol mavjud:
 *   - manager       (Bosh menejer)   — to'liq kirish, statistika, sozlamalar
 *   - reception     (Qabul xodimi)   — check-in/out, buyurtmalar, maint hisobot
 *   - housekeeping  (Tozalash xodim) — faqat tozalash navbatini boshqarish
 *   - maintenance   (Texnik xodim)   — faqat texnik xizmat so'rovlari
 *
 * Har bir rolga aniq ruxsatlar to'plami (permissions) belgilangan. API
 * endpointlari requirePermission() o'rqali bu ruxsatlarni tekshiradi. Bundan
 * tashqari, panel ma'lumotlarini rolga qarab tozalash funksiyasi mavjud:
 * narxlar, daromad va to'lov tafsilotlari faqat moliyaviy ko'rish huquqi
 * bo'lgan rollarga ko'rinadi.
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const logger = require('./logger');

// --------------------------------------------------------------------------
// PAROLLARNI SHIFRLASH
// --------------------------------------------------------------------------
const SALT = 'hotelos-pdp-2026';

function hashPassword(plain) {
  return crypto.createHash('sha256').update(SALT + plain).digest('hex');
}

// --------------------------------------------------------------------------
// FOYDALANUVCHILAR (demo hisoblar)
// --------------------------------------------------------------------------
const USERS = [
  { username: 'admin',         passwordHash: hashPassword('admin123'),         role: 'manager',      displayName: 'Bosh Menejer' },
  { username: 'reception',     passwordHash: hashPassword('reception123'),     role: 'reception',    displayName: 'Qabul Xodimi' },
  { username: 'housekeeping',  passwordHash: hashPassword('housekeeping123'),  role: 'housekeeping', displayName: 'Tozalash Xodimi' },
  { username: 'maintenance',   passwordHash: hashPassword('maintenance123'),   role: 'maintenance',  displayName: 'Texnik Xodim' },
];

// --------------------------------------------------------------------------
// ROLGA ASOSLANGAN SIYOSAT (POLICIES)
//
// Har bir rol uchun:
//   - permissions: API endpointlariga kirish ruxsatlari
//   - pages: panelda ko'rinadigan sahifalar (sidebar uchun)
//   - landingPage: tizimga kirgandan so'ng ochiladigan sahifa
//   - canSeeFinancials: narxlar va daromadlarni ko'rsatish
//   - canSeeStaffNames: xodimlar ismlari (texnik, tozalovchi)
// --------------------------------------------------------------------------
const POLICIES = {
  manager: {
    role: 'manager',
    displayName: 'Bosh Menejer',
    description: 'To\'liq nazorat — hamma narsani ko\'radi, lekin xodimlar ishini bajarmaydi. Faqat eslatma yuboradi va statistikani kuzatadi.',
    canSeeFinancials: true,
    canSeeStaffNames: true,
    permissions: new Set([
      // Mehmonlar nazorati (lekin bevosita check-in/out qilmaydi)
      'reception.inventory',
      // Xona/buyurtma/texnik so'rov KO'RISH (lekin BAJARMASLIK)
      'housekeeping.queue.view',
      'orders.view', 'orders.menu',
      'maintenance.view',
      // ENG MUHIM: faqat eslatma yuborish — boshqalar ishini bajarmaydi
      'manager.remind_housekeeping',  // tozalovchiga eslatma
      'manager.remind_maintenance',   // texnikka eslatma
      'manager.force_maintenance',    // favqulodda holat: xonani texnik xizmatga majburlash
      // Sozlamalar va monitoring
      'notifications.view', 'notifications.modify',
      'settings.view', 'settings.update', 'settings.reset',
      'tests.run',
      'events.view', 'broker.topics',
      'dashboard.view',
      'stats.view',
      'history.view',  // tarixiy ma'lumotlar va xodim faoliyati
    ]),
    pages: ['dashboard', 'rooms', 'reception', 'housekeeping', 'orders', 'maintenance', 'tests', 'events', 'architecture', 'settings'],
    landingPage: 'dashboard',
  },
  reception: {
    role: 'reception',
    displayName: 'Qabul Xodimi',
    description: 'Mehmonlar bilan ishlash: check-in/out, xona xizmati, tozalash buyrug\'i, texnik muammo qayd qilish',
    canSeeFinancials: true,
    canSeeStaffNames: true,
    permissions: new Set([
      'reception.checkin', 'reception.checkout', 'reception.inventory',
      'reception.confirm_available', 'reception.mark_needs_cleaning',
      // Tozalash navbatini boshqarish (lekin o'zi tozalamaydi)
      'housekeeping.queue.view', 'housekeeping.enqueue',
      'orders.view', 'orders.create', 'orders.advance', 'orders.cancel', 'orders.menu',
      // Texnik muammolarni qabul xodimi qayd qiladi
      'maintenance.view', 'maintenance.report',
      'notifications.view', 'notifications.modify',
      'settings.view',
      'events.view',
      'dashboard.view',
    ]),
    pages: ['dashboard', 'rooms', 'reception', 'orders', 'maintenance', 'events', 'architecture', 'settings'],
    landingPage: 'reception',
  },
  housekeeping: {
    role: 'housekeeping',
    displayName: 'Tozalash Xodimi',
    description: 'Tozalash navbati va xona holatlarini boshqarish. Har 12 soatda barcha xonalarni qayta tozalash.',
    canSeeFinancials: false,
    canSeeStaffNames: false,
    permissions: new Set([
      'reception.inventory',
      // Faqat tozalash xodimi tozalashni boshlay/yakunlay oladi
      'housekeeping.queue.view', 'housekeeping.start', 'housekeeping.complete', 'housekeeping.enqueue',
      'notifications.view', 'notifications.modify',
      'settings.view',
      'events.view',
      'dashboard.view',
    ]),
    pages: ['dashboard', 'rooms', 'housekeeping', 'events', 'architecture', 'settings'],
    landingPage: 'housekeeping',
  },
  maintenance: {
    role: 'maintenance',
    displayName: 'Texnik Xodim',
    description: 'Faqat qabul xodimi qayd qilgan ishlarni ijro etadi. O\'zi yangi so\'rov yarata olmaydi.',
    canSeeFinancials: false,
    canSeeStaffNames: true,
    permissions: new Set([
      'reception.inventory',
      // MUHIM: maintenance.report YO'Q — texnik o'ziga ish yarata olmaydi
      // Faqat keladigan ishlarni qabul qilib, bajaradi
      'maintenance.view', 'maintenance.acknowledge', 'maintenance.start', 'maintenance.resolve',
      'notifications.view', 'notifications.modify',
      'settings.view',
      'events.view',
      'dashboard.view',
    ]),
    pages: ['dashboard', 'rooms', 'maintenance', 'events', 'architecture', 'settings'],
    landingPage: 'maintenance',
  },
};

function getPolicy(role) {
  return POLICIES[role] || null;
}

/** Front-end uchun xavfsiz siyosat ko'rinishi (Set -> Array) */
function publicPolicy(role) {
  const p = POLICIES[role];
  if (!p) return null;
  return {
    role: p.role,
    displayName: p.displayName,
    description: p.description,
    canSeeFinancials: p.canSeeFinancials,
    canSeeStaffNames: p.canSeeStaffNames,
    permissions: Array.from(p.permissions),
    pages: p.pages,
    landingPage: p.landingPage,
  };
}

// --------------------------------------------------------------------------
// FAOL TOKENLAR (8 soat TTL)
// --------------------------------------------------------------------------
const tokens = new Map();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function login(username, password) {
  const user = USERS.find((u) => u.username === username);
  // Bir xil xato xabari — foydalanuvchi ro'yxati oshkor etilmasligi uchun
  if (!user || user.passwordHash !== hashPassword(password)) {
    logger.warn(`[AUTH] Muvaffaqiyatsiz kirish urinishi: ${username}`);
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
    user: { username: user.username, role: user.role, displayName: user.displayName },
    policy: publicPolicy(user.role),
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

// --------------------------------------------------------------------------
// EXPRESS MIDDLEWARELARI
// --------------------------------------------------------------------------

/** Token tekshiruvi */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const session = validateToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
  req.session = session;
  req.policy = POLICIES[session.role];
  next();
}

/** Ruxsat tekshiruvi (requireAuth dan keyin ishlatiladi) */
function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.policy) {
      return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    }
    if (!req.policy.permissions.has(perm)) {
      logger.warn(`[AUTH] Rad etildi: ${req.session.username} (${req.session.role}) -> ${perm}`);
      return res.status(403).json({
        error: `Sizning rolingiz (${req.policy.displayName}) bu amalni bajara olmaydi`,
      });
    }
    next();
  };
}

// --------------------------------------------------------------------------
// MA'LUMOTLARNI ROL BO'YICHA TOZALASH
//
// Narxlar, hisob-kitob ma'lumotlari va statistika faqat moliyaviy
// ko'rish huquqi bor rollarga (manager, reception) yuboriladi. Boshqalar
// uchun bu maydonlar javobdan olib tashlanadi.
// --------------------------------------------------------------------------
function sanitizeForRole(data, role) {
  const policy = POLICIES[role];
  if (!policy) return data;
  if (policy.canSeeFinancials) return data;

  // Chuqur nusxa olib, narxlarni olib tashlaymiz
  const cleaned = JSON.parse(JSON.stringify(data));

  // 1. Xonalardan tunlik narxni olib tashlash
  if (Array.isArray(cleaned.rooms)) {
    cleaned.rooms.forEach((r) => {
      delete r.nightlyRate;
    });
  }

  // 2. Buyurtmalardan to'lov ma'lumotlarini olib tashlash
  const stripOrder = (o) => {
    if (!o) return;
    delete o.total;
    if (Array.isArray(o.items)) {
      o.items.forEach((i) => {
        delete i.unitPrice;
        delete i.lineTotal;
      });
    }
  };
  if (Array.isArray(cleaned.activeOrders)) cleaned.activeOrders.forEach(stripOrder);
  if (Array.isArray(cleaned.orders)) cleaned.orders.forEach(stripOrder);

  // 3. Menyu narxlarini olib tashlash
  if (Array.isArray(cleaned.menu)) {
    cleaned.menu.forEach((m) => { delete m.price; });
  }

  // 4. Daromad statistikasini olib tashlash
  if (cleaned.stats) {
    delete cleaned.stats.totalRevenue;
  }

  // 5. Mehmon qo'shimcha to'lovlarini olib tashlash
  if (Array.isArray(cleaned.guests)) {
    cleaned.guests.forEach((g) => {
      if (Array.isArray(g.extraCharges)) g.extraCharges = [];
    });
  }

  return cleaned;
}

module.exports = {
  // autentifikatsiya
  login,
  logout,
  validateToken,
  requireAuth,
  // ruxsatlar
  requirePermission,
  getPolicy,
  publicPolicy,
  POLICIES,
  // ma'lumotlarni tozalash
  sanitizeForRole,
  // test foydasi uchun
  _users: USERS,
};
