/**
 * historicalSeed.js
 * --------------------------------------------------------------------------
 * Tarixiy ma'lumotlar (fake data) — boshliq nazorat paneli uchun.
 * Bu ma'lumotlar bosh menejer uchun statistika va xodim faoliyatini
 * ko'rsatish maqsadida ishlatiladi.
 *
 * Tarkibi:
 *   - 15 ta o'tgan buyurtma (turli xonalar, turli xizmatlar)
 *   - 4 ta o'tgan texnik so'rov (buyurtmalarga bog'liq, hal qilingan)
 *   - Tozalash tarixi (har 12 soatda vaqtida bajarilgan)
 *   - Xodim faoliyati ko'rsatkichlari
 * --------------------------------------------------------------------------
 */

'use strict';

const NOW = Date.now();
const DAY = 1000 * 60 * 60 * 24;
const HOUR = 1000 * 60 * 60;

// --------------------------------------------------------------------------
// 15 ta o'tgan buyurtma — turli xonalar, mehmonlar, taomlar va xizmatlar
// --------------------------------------------------------------------------
const bookingHistory = [
  {
    id: 'bk_h_001', guestName: 'Aziz Karimov', phone: '+998 90 111 22 33',
    roomNumber: 101, roomType: 'single', checkInAt: NOW - 30 * DAY, checkOutAt: NOW - 28 * DAY,
    nights: 2, totalRevenue: 700000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Kontinental nonushta', qty: 2, price: 180000 },
      { type: 'drink', name: 'Espresso', qty: 4, price: 100000 },
    ],
  },
  {
    id: 'bk_h_002', guestName: 'Nilufar Sodiqova', phone: '+998 91 234 56 78',
    roomNumber: 204, roomType: 'suite', checkInAt: NOW - 28 * DAY, checkOutAt: NOW - 25 * DAY,
    nights: 3, totalRevenue: 3600000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Margarita pitsa', qty: 2, price: 240000 },
      { type: 'food', name: 'Sezar salatasi', qty: 1, price: 55000 },
      { type: 'drink', name: 'Tabiiy sharbat', qty: 3, price: 105000 },
    ],
  },
  {
    id: 'bk_h_003', guestName: 'David Johnson', phone: '+44 7700 900 123',
    roomNumber: 105, roomType: 'accessible', checkInAt: NOW - 25 * DAY, checkOutAt: NOW - 22 * DAY,
    nights: 3, totalRevenue: 1200000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Klub sandvich', qty: 3, price: 195000 },
      { type: 'drink', name: 'Amerikano', qty: 6, price: 180000 },
    ],
    relatedIssues: ['mh_h_001'], // texnik muammo bo'lgan
  },
  {
    id: 'bk_h_004', guestName: 'Marina Petrova', phone: '+7 985 123 4567',
    roomNumber: 202, roomType: 'double', checkInAt: NOW - 22 * DAY, checkOutAt: NOW - 21 * DAY,
    nights: 1, totalRevenue: 550000, paymentMethod: 'cash',
    services: [
      { type: 'drink', name: 'Kapuchino', qty: 2, price: 76000 },
    ],
  },
  {
    id: 'bk_h_005', guestName: 'Rustam Toshev', phone: '+998 93 456 78 90',
    roomNumber: 103, roomType: 'double', checkInAt: NOW - 20 * DAY, checkOutAt: NOW - 17 * DAY,
    nights: 3, totalRevenue: 1650000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Karbonara', qty: 2, price: 170000 },
      { type: 'food', name: 'Lag\'mon', qty: 1, price: 45000 },
      { type: 'food', name: 'Tort bo\'lagi', qty: 2, price: 80000 },
      { type: 'drink', name: 'Choy', qty: 4, price: 72000 },
    ],
    relatedIssues: ['mh_h_002'], // texnik muammo bo'lgan
  },
  {
    id: 'bk_h_006', guestName: 'Aisha Mahmudova', phone: '+998 90 567 89 01',
    roomNumber: 205, roomType: 'suite', checkInAt: NOW - 18 * DAY, checkOutAt: NOW - 16 * DAY,
    nights: 2, totalRevenue: 2400000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Kontinental nonushta', qty: 4, price: 360000 },
      { type: 'food', name: 'Mavsumiy mevalar', qty: 2, price: 100000 },
      { type: 'drink', name: 'Tabiiy sharbat', qty: 4, price: 140000 },
    ],
  },
  {
    id: 'bk_h_007', guestName: 'Otabek Yusupov', phone: '+998 94 678 90 12',
    roomNumber: 102, roomType: 'single', checkInAt: NOW - 17 * DAY, checkOutAt: NOW - 16 * DAY,
    nights: 1, totalRevenue: 350000, paymentMethod: 'card',
    services: [
      { type: 'drink', name: 'Espresso', qty: 1, price: 25000 },
    ],
  },
  {
    id: 'bk_h_008', guestName: 'Elena Volkova', phone: '+7 921 555 12 34',
    roomNumber: 201, roomType: 'single', checkInAt: NOW - 15 * DAY, checkOutAt: NOW - 13 * DAY,
    nights: 2, totalRevenue: 700000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Sezar salatasi', qty: 2, price: 110000 },
      { type: 'drink', name: 'Mineral suv', qty: 3, price: 45000 },
    ],
    relatedIssues: ['mh_h_003'], // texnik muammo bo'lgan
  },
  {
    id: 'bk_h_009', guestName: 'Hasan Norov', phone: '+998 99 789 01 23',
    roomNumber: 104, roomType: 'double', checkInAt: NOW - 13 * DAY, checkOutAt: NOW - 11 * DAY,
    nights: 2, totalRevenue: 1100000, paymentMethod: 'cash',
    services: [
      { type: 'food', name: 'Margarita pitsa', qty: 1, price: 120000 },
      { type: 'drink', name: 'Amerikano', qty: 3, price: 90000 },
    ],
  },
  {
    id: 'bk_h_010', guestName: 'Sabina Rashidova', phone: '+998 90 890 12 34',
    roomNumber: 203, roomType: 'double', checkInAt: NOW - 11 * DAY, checkOutAt: NOW - 8 * DAY,
    nights: 3, totalRevenue: 1650000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Kontinental nonushta', qty: 6, price: 540000 },
      { type: 'food', name: 'Klub sandvich', qty: 2, price: 130000 },
      { type: 'drink', name: 'Kapuchino', qty: 5, price: 190000 },
    ],
  },
  {
    id: 'bk_h_011', guestName: 'Michael Brown', phone: '+1 415 555 0123',
    roomNumber: 204, roomType: 'suite', checkInAt: NOW - 9 * DAY, checkOutAt: NOW - 6 * DAY,
    nights: 3, totalRevenue: 3600000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Karbonara', qty: 3, price: 255000 },
      { type: 'food', name: 'Tort bo\'lagi', qty: 4, price: 160000 },
      { type: 'drink', name: 'Tabiiy sharbat', qty: 6, price: 210000 },
      { type: 'drink', name: 'Espresso', qty: 8, price: 200000 },
    ],
    relatedIssues: ['mh_h_004'], // texnik muammo bo'lgan
  },
  {
    id: 'bk_h_012', guestName: 'Dilshod Qodirov', phone: '+998 91 901 23 45',
    roomNumber: 101, roomType: 'single', checkInAt: NOW - 7 * DAY, checkOutAt: NOW - 6 * DAY,
    nights: 1, totalRevenue: 350000, paymentMethod: 'card',
    services: [],
  },
  {
    id: 'bk_h_013', guestName: 'Yulia Ivanova', phone: '+7 905 111 22 33',
    roomNumber: 105, roomType: 'accessible', checkInAt: NOW - 6 * DAY, checkOutAt: NOW - 4 * DAY,
    nights: 2, totalRevenue: 800000, paymentMethod: 'cash',
    services: [
      { type: 'food', name: 'Lag\'mon', qty: 2, price: 90000 },
      { type: 'drink', name: 'Choy', qty: 4, price: 72000 },
    ],
  },
  {
    id: 'bk_h_014', guestName: 'Bekhzod Sharipov', phone: '+998 90 012 34 56',
    roomNumber: 202, roomType: 'double', checkInAt: NOW - 4 * DAY, checkOutAt: NOW - 2 * DAY,
    nights: 2, totalRevenue: 1100000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Margarita pitsa', qty: 1, price: 120000 },
      { type: 'food', name: 'Sezar salatasi', qty: 1, price: 55000 },
      { type: 'drink', name: 'Kapuchino', qty: 3, price: 114000 },
    ],
  },
  {
    id: 'bk_h_015', guestName: 'Olivia Smith', phone: '+44 7700 900 456',
    roomNumber: 205, roomType: 'suite', checkInAt: NOW - 3 * DAY, checkOutAt: NOW - 1 * DAY,
    nights: 2, totalRevenue: 2400000, paymentMethod: 'card',
    services: [
      { type: 'food', name: 'Kontinental nonushta', qty: 4, price: 360000 },
      { type: 'food', name: 'Karbonara', qty: 2, price: 170000 },
      { type: 'drink', name: 'Tabiiy sharbat', qty: 4, price: 140000 },
    ],
  },
];

// --------------------------------------------------------------------------
// O'tgan 4 ta texnik so'rov — buyurtmalar paytida yuzaga kelgan va
// hal qilingan (texnik xodim tarixi)
// --------------------------------------------------------------------------
const maintenanceHistory = [
  {
    id: 'mh_h_001',
    roomNumber: 105,
    relatedBookingId: 'bk_h_003',
    category: 'plumbing',
    urgency: 'high',
    description: 'Hammomda sovuq suv kuchsiz oqyapti',
    reportedBy: 'Qabul xodimi',
    reportedAt: NOW - 24 * DAY,
    acknowledgedBy: 'Akmal Rasulov',
    acknowledgedAt: NOW - 24 * DAY + 12 * 60 * 1000, // 12 daqiqada qabul qilgan
    startedAt: NOW - 24 * DAY + 25 * 60 * 1000,
    resolvedBy: 'Akmal Rasulov',
    resolvedAt: NOW - 24 * DAY + 95 * 60 * 1000, // 1 soat 35 daqiqada hal qilgan
    resolutionNotes: 'Filtr almashtirildi, suv bosimi normallashdi',
    durationMs: 95 * 60 * 1000,
  },
  {
    id: 'mh_h_002',
    roomNumber: 103,
    relatedBookingId: 'bk_h_005',
    category: 'electrical',
    urgency: 'normal',
    description: 'Karavot yonidagi chiroq yonmayapti',
    reportedBy: 'Qabul xodimi',
    reportedAt: NOW - 19 * DAY,
    acknowledgedBy: 'Bekzod Tursunov',
    acknowledgedAt: NOW - 19 * DAY + 8 * 60 * 1000, // 8 daqiqada
    startedAt: NOW - 19 * DAY + 18 * 60 * 1000,
    resolvedBy: 'Bekzod Tursunov',
    resolvedAt: NOW - 19 * DAY + 48 * 60 * 1000, // 48 daqiqada hal qilgan
    resolutionNotes: 'Lampa yangilandi va sim ulanishi mustahkamlandi',
    durationMs: 48 * 60 * 1000,
  },
  {
    id: 'mh_h_003',
    roomNumber: 201,
    relatedBookingId: 'bk_h_008',
    category: 'hvac',
    urgency: 'high',
    description: 'Konditsioner ishlamayapti, xona issiq',
    reportedBy: 'Qabul xodimi',
    reportedAt: NOW - 14 * DAY,
    acknowledgedBy: 'Sardor Aliyev',
    acknowledgedAt: NOW - 14 * DAY + 6 * 60 * 1000, // 6 daqiqada (juda tez!)
    startedAt: NOW - 14 * DAY + 15 * 60 * 1000,
    resolvedBy: 'Sardor Aliyev',
    resolvedAt: NOW - 14 * DAY + 125 * 60 * 1000, // 2 soat 5 daqiqada
    resolutionNotes: 'Freon to\'ldirildi, filtr tozalandi',
    durationMs: 125 * 60 * 1000,
  },
  {
    id: 'mh_h_004',
    roomNumber: 204,
    relatedBookingId: 'bk_h_011',
    category: 'lock',
    urgency: 'critical',
    description: 'Eshik kaliti ishlamayapti, mijoz xonaga kira olmayapti',
    reportedBy: 'Qabul xodimi',
    reportedAt: NOW - 8 * DAY,
    acknowledgedBy: 'Akmal Rasulov',
    acknowledgedAt: NOW - 8 * DAY + 3 * 60 * 1000, // 3 daqiqada (kritik!)
    startedAt: NOW - 8 * DAY + 8 * 60 * 1000,
    resolvedBy: 'Akmal Rasulov',
    resolvedAt: NOW - 8 * DAY + 35 * 60 * 1000, // 35 daqiqada
    resolutionNotes: 'Elektron qulf to\'liq qayta dasturlandi',
    durationMs: 35 * 60 * 1000,
  },
];

// --------------------------------------------------------------------------
// Tozalash tarixi — har 12 soatda vaqtida tozalangan (90 yozuv, 30 kun)
// --------------------------------------------------------------------------
function generateCleaningHistory() {
  const records = [];
  const housekeepers = ['Munira Karimova', 'Dilfuza Saidova'];
  const rooms = [101, 102, 103, 104, 105, 201, 202, 203, 204, 205];

  // Har bir xona uchun har 12 soatda bittadan tozalash, 30 kun davomida
  for (let day = 30; day >= 1; day--) {
    for (const roomNumber of rooms) {
      // Kuniga 2 marta (har 12 soat: 09:00 va 21:00 atrofida)
      for (const hour of [9, 21]) {
        const scheduledAt = NOW - day * DAY + hour * HOUR;
        // Doimiy vaqtida ishlash — 0-8 daqiqa kechikish (90+% holatda < 5 daq.)
        const lateness = Math.random() < 0.92
          ? Math.floor(Math.random() * 5 * 60 * 1000)        // 92% — 0-5 daq.
          : 5 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000); // 8% — 5-15 daq.
        const actualStart = scheduledAt + lateness;
        const durationMin = 18 + Math.floor(Math.random() * 12); // 18-30 daqiqa
        const completedAt = actualStart + durationMin * 60 * 1000;
        const housekeeper = housekeepers[Math.floor(Math.random() * housekeepers.length)];
        const onTime = (actualStart - scheduledAt) < 10 * 60 * 1000; // 10 daq.gacha — vaqtida

        records.push({
          id: `ch_h_${day}_${roomNumber}_${hour}`,
          roomNumber,
          scheduledAt,
          startedAt: actualStart,
          completedAt,
          durationMs: durationMin * 60 * 1000,
          cleanedBy: housekeeper,
          onTime,
        });
      }
    }
  }
  return records;
}

const cleaningHistory = generateCleaningHistory();

// --------------------------------------------------------------------------
// Xodim faoliyati ko'rsatkichlari — boshliq nazorat paneli uchun
// --------------------------------------------------------------------------
function calculatePerformance() {
  // Tozalovchilar — tarixdan hisoblanadi
  const housekeepers = {};
  cleaningHistory.forEach((rec) => {
    if (!housekeepers[rec.cleanedBy]) {
      housekeepers[rec.cleanedBy] = { total: 0, onTime: 0, totalDuration: 0 };
    }
    housekeepers[rec.cleanedBy].total++;
    if (rec.onTime) housekeepers[rec.cleanedBy].onTime++;
    housekeepers[rec.cleanedBy].totalDuration += rec.durationMs;
  });

  // Texniklar — maintenanceHistory dan
  const technicians = {};
  maintenanceHistory.forEach((req) => {
    const tech = req.resolvedBy;
    if (!technicians[tech]) {
      technicians[tech] = { total: 0, totalResponseMs: 0, totalDurationMs: 0 };
    }
    technicians[tech].total++;
    technicians[tech].totalResponseMs += (req.acknowledgedAt - req.reportedAt);
    technicians[tech].totalDurationMs += req.durationMs;
  });

  return {
    housekeepers: Object.entries(housekeepers).map(([name, s]) => ({
      name,
      totalCleanings: s.total,
      onTimePercent: Math.round((s.onTime / s.total) * 100),
      avgDurationMs: Math.round(s.totalDuration / s.total),
    })),
    technicians: Object.entries(technicians).map(([name, s]) => ({
      name,
      totalResolved: s.total,
      avgResponseMs: Math.round(s.totalResponseMs / s.total),
      avgResolutionMs: Math.round(s.totalDurationMs / s.total),
    })),
  };
}

const staffPerformance = calculatePerformance();

module.exports = {
  bookingHistory,
  maintenanceHistory,
  cleaningHistory,
  staffPerformance,
};
