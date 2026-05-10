/**
 * validator.js
 * --------------------------------------------------------------------------
 * Markaziy kiritishni tekshirish moduli. Tashqaridan tizimga kiruvchi har
 * bir ma'lumot qayta ishlanishidan oldin shu yerda tekshiriladi. Xatolik
 * holatida foydalanuvchiga aniq xabar qaytariladi — stek izi oshkor
 * etilmaydi (xavfsizlik talabi).
 * --------------------------------------------------------------------------
 */

'use strict';

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

const ROOM_TYPES = ['single', 'double', 'suite', 'accessible'];
const URGENCY_LEVELS = ['critical', 'high', 'normal', 'low'];
const PROXIMITY_PREF = ['none', 'near_elevator', 'near_stairs'];

function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} matn (string) bo'lishi kerak`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ValidationError(`${field} kamida ${min} ta belgidan iborat bo'lishi kerak`, field);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${field} ${max} ta belgidan oshmasligi kerak`, field);
  }
  // XSS-himoya — asosiy belgilarni rad etish
  if (/[<>{}]/.test(trimmed)) {
    throw new ValidationError(`${field} ruxsat etilmagan belgilarni o'z ichiga oladi`, field);
  }
  return trimmed;
}

function requireInt(value, field, { min, max } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${field} butun son bo'lishi kerak`, field);
  }
  if (min !== undefined && n < min) {
    throw new ValidationError(`${field} kamida ${min} bo'lishi kerak`, field);
  }
  if (max !== undefined && n > max) {
    throw new ValidationError(`${field} ${max} dan oshmasligi kerak`, field);
  }
  return n;
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `${field} quyidagilardan biri bo'lishi kerak: ${allowed.join(', ')}`,
      field,
    );
  }
  return value;
}

function validateCheckIn(body) {
  const guestName = requireString(body.guestName, 'Mehmon ismi', { min: 2, max: 80 });
  const roomType = requireEnum(body.roomType, ROOM_TYPES, 'Xona turi');
  const nights = requireInt(body.nights, 'Tunlar soni', { min: 1, max: 90 });
  const floorPreference = body.floorPreference != null
    ? requireInt(body.floorPreference, 'Qavat afzalligi', { min: 1, max: 2 })
    : null;
  const proximityPreference = body.proximityPreference
    ? requireEnum(body.proximityPreference, PROXIMITY_PREF, 'Yaqinlik afzalligi')
    : 'none';
  return { guestName, roomType, nights, floorPreference, proximityPreference };
}

function validateRoomNumber(roomNumber, field = 'Xona raqami') {
  const n = requireInt(roomNumber, field, { min: 100, max: 299 });
  // Hotel kamida 2 qavatli, har qavatda 5 ta xona (101-105, 201-205)
  const floor = Math.floor(n / 100);
  const idx = n % 100;
  if (floor < 1 || floor > 2 || idx < 1 || idx > 5) {
    throw new ValidationError(`${field} mavjud emas (kutilgan: 101-105 yoki 201-205)`, field);
  }
  return n;
}

function validateOrder(body) {
  const roomNumber = validateRoomNumber(body.roomNumber);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('Buyurtma kamida bitta mahsulot bo\'lishi kerak', 'items');
  }
  if (body.items.length > 20) {
    throw new ValidationError('Bitta buyurtmada 20 dan ortiq mahsulot bo\'lmasligi kerak', 'items');
  }
  const items = body.items.map((it, i) => {
    if (!it || typeof it !== 'object') {
      throw new ValidationError(`Mahsulot ${i + 1} noto'g'ri`, 'items');
    }
    return {
      itemId: requireString(it.itemId, `items[${i}].itemId`, { min: 1, max: 40 }),
      quantity: requireInt(it.quantity, `items[${i}].quantity`, { min: 1, max: 20 }),
    };
  });
  return { roomNumber, items };
}

function validateMaintenance(body) {
  const roomNumber = validateRoomNumber(body.roomNumber);
  const description = requireString(body.description, 'Tavsif', { min: 5, max: 300 });
  const urgency = requireEnum(body.urgency, URGENCY_LEVELS, 'Shoshilinchlik darajasi');
  const category = requireString(body.category || 'other', 'Kategoriya', { min: 2, max: 40 });
  return { roomNumber, description, urgency, category };
}

function validateLogin(body) {
  const username = requireString(body.username, 'Foydalanuvchi nomi', { min: 3, max: 40 });
  const password = requireString(body.password, 'Parol', { min: 4, max: 100 });
  return { username, password };
}

module.exports = {
  ValidationError,
  ROOM_TYPES,
  URGENCY_LEVELS,
  validateCheckIn,
  validateRoomNumber,
  validateOrder,
  validateMaintenance,
  validateLogin,
  requireString,
  requireInt,
  requireEnum,
};
