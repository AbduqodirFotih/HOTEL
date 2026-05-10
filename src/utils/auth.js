/**
 * auth.js
 * --------------------------------------------------------------------------
 * Soddalashtirilgan token asosidagi autentifikatsiya. Ishlab chiqarish
 * muhitida bcrypt + JWT ishlatilishi kerak; bu yerda namoyish maqsadida
 * soddalashtirilgan, lekin tegishli xavfsizlik tamoyillariga rioya qilingan
 * (parollar shifrlangan holda saqlanadi).
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const logger = require('./logger');

// Demo foydalanuvchilar (parollar SHA-256 + tuz bilan shifrlangan)
const SALT = 'hotelos-pdp-2026';

function hashPassword(plain) {
  return crypto.createHash('sha256').update(SALT + plain).digest('hex');
}

const USERS = [
  {
    username: 'admin',
    passwordHash: hashPassword('admin123'),
    role: 'manager',
    displayName: 'Bosh Menejer',
  },
  {
    username: 'reception',
    passwordHash: hashPassword('reception123'),
    role: 'reception',
    displayName: 'Qabul Xodimi',
  },
  {
    username: 'housekeeping',
    passwordHash: hashPassword('housekeeping123'),
    role: 'housekeeping',
    displayName: 'Tozalash Xodimi',
  },
];

// Faol tokenlar (memoryda) — token -> { username, role, issuedAt }
const tokens = new Map();
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8; // 8 soat

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
  return { token, user: { username: user.username, role: user.role, displayName: user.displayName } };
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

/** Express middleware — Authorization sarlavhasini tekshiradi */
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

module.exports = {
  login,
  logout,
  validateToken,
  requireAuth,
  // Test foydasi uchun
  _users: USERS,
};
