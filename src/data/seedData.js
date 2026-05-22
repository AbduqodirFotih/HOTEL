/**
 * seedData.js
 * --------------------------------------------------------------------------
 * Boshlang'ich ma'lumotlar — 2 qavatda 10 ta xona.
 *
 * Xona statuslari (6 ta):
 *   - available          : Bo'sh, tayyor (yangi mehmonlarga berish mumkin)
 *   - occupied           : Band (mehmon ichida)
 *   - cleaning_required  : Tozalash kerak (check-out qilingan yoki 12 soat o'tgan)
 *   - cleaning           : Tozalanmoqda (xodim ish boshlagan)
 *   - inspection         : Tekshiruvda (tozalandi, qabul tekshirishi kerak)
 *   - maintenance        : Texnik xizmatda (band emas, lekin tayyor emas)
 *
 * Narxlar O'zbekiston so'mida (UZS).
 * --------------------------------------------------------------------------
 */

'use strict';

const NOW = Date.now();
const ONE_HOUR = 1000 * 60 * 60;

// 10 ta xona, har qavatda 5 ta (101-105, 201-205)
const rooms = [
  // 1-qavat
  { number: 101, floor: 1, type: 'single', status: 'available', nightlyRate: 350000,
    nearElevator: true, nearStairs: false, lastCleanedAt: NOW - 2 * ONE_HOUR },
  { number: 102, floor: 1, type: 'single', status: 'available', nightlyRate: 350000,
    nearElevator: true, nearStairs: false, lastCleanedAt: NOW - 5 * ONE_HOUR },
  { number: 103, floor: 1, type: 'double', status: 'available', nightlyRate: 550000,
    nearElevator: false, nearStairs: false, lastCleanedAt: NOW - 7 * ONE_HOUR },
  { number: 104, floor: 1, type: 'double', status: 'cleaning_required', nightlyRate: 550000,
    nearElevator: false, nearStairs: true, lastCleanedAt: NOW - 14 * ONE_HOUR,
    dirtyAt: NOW - 1.5 * ONE_HOUR },
  { number: 105, floor: 1, type: 'accessible', status: 'available', nightlyRate: 400000,
    nearElevator: true, nearStairs: false, lastCleanedAt: NOW - 3 * ONE_HOUR },

  // 2-qavat
  { number: 201, floor: 2, type: 'single', status: 'available', nightlyRate: 350000,
    nearElevator: true, nearStairs: false, lastCleanedAt: NOW - 9 * ONE_HOUR },
  { number: 202, floor: 2, type: 'double', status: 'available', nightlyRate: 550000,
    nearElevator: true, nearStairs: false, lastCleanedAt: NOW - 11 * ONE_HOUR },
  { number: 203, floor: 2, type: 'double', status: 'available', nightlyRate: 550000,
    nearElevator: false, nearStairs: false, lastCleanedAt: NOW - 6 * ONE_HOUR },
  { number: 204, floor: 2, type: 'suite', status: 'occupied', nightlyRate: 1200000,
    nearElevator: false, nearStairs: false, lastCleanedAt: NOW - 18 * ONE_HOUR,
    occupiedBy: 'guest_demo_001', occupiedAt: NOW - 2 * 24 * ONE_HOUR },
  { number: 205, floor: 2, type: 'suite', status: 'available', nightlyRate: 1200000,
    nearElevator: false, nearStairs: true, lastCleanedAt: NOW - 4 * ONE_HOUR },
];

// Xona xizmati menyusi (narxlar UZS)
const menu = [
  { id: 'espresso',   name: 'Espresso',           category: 'drink', price: 25000 },
  { id: 'coffee',     name: 'Amerikano',          category: 'drink', price: 30000 },
  { id: 'cappuccino', name: 'Kapuchino',          category: 'drink', price: 38000 },
  { id: 'tea',        name: 'Choy (qora/yashil)', category: 'drink', price: 18000 },
  { id: 'water',      name: 'Mineral suv (0.5L)', category: 'drink', price: 15000 },
  { id: 'juice',      name: 'Tabiiy sharbat',     category: 'drink', price: 35000 },

  { id: 'sandwich',   name: 'Klub sandvich',      category: 'food',  price: 65000 },
  { id: 'pizza',      name: 'Margarita pitsa',    category: 'food',  price: 120000 },
  { id: 'salad',      name: 'Sezar salatasi',     category: 'food',  price: 55000 },
  { id: 'pasta',      name: 'Karbonara',          category: 'food',  price: 85000 },
  { id: 'soup',       name: 'Lag\'mon',            category: 'food',  price: 45000 },
  { id: 'breakfast',  name: 'Kontinental nonushta', category: 'food', price: 90000 },

  { id: 'dessert',    name: 'Tort bo\'lagi',       category: 'food',  price: 40000 },
  { id: 'fruit',      name: 'Mavsumiy mevalar',   category: 'food',  price: 50000 },
];

// Texniklar
const technicians = [
  { id: 'tech_01', name: 'Akmal Rasulov',  specialty: 'plumbing',   available: true },
  { id: 'tech_02', name: 'Bekzod Tursunov', specialty: 'electrical', available: true },
  { id: 'tech_03', name: 'Sardor Aliyev',   specialty: 'general',    available: true },
];

// Tozalash xodimlari
const housekeepers = [
  { id: 'hk_01', name: 'Munira Karimova',  available: true },
  { id: 'hk_02', name: 'Dilfuza Saidova',  available: true },
];

// Demo mehmon (204-xonada)
const guests = [
  {
    id: 'guest_demo_001',
    name: 'Aziz Karimov',
    roomNumber: 204,
    checkInAt: NOW - 2 * 24 * ONE_HOUR,
    nights: 3,
    paymentMethod: 'card',
    extraCharges: [],
  },
];

const orders = [];
const maintenanceRequests = [];
const notifications = [];

module.exports = {
  rooms,
  menu,
  technicians,
  housekeepers,
  guests,
  orders,
  maintenanceRequests,
  notifications,
};
