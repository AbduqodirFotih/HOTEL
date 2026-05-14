/**
 * testRunner.js
 * --------------------------------------------------------------------------
 * Topshiriqdagi 8 ta test stsenariyini (TS-01 ... TS-08) avtomatik
 * bajaradigan modul. API serverini ishga tushirmasdan, to'g'ridan-to'g'ri
 * servislarni chaqirib sinab ko'radi.
 *
 * Foydalanish:
 *   node src/tests/testRunner.js         -> CLI da ishga tushirish
 *   POST /api/tests/run/:id              -> API orqali ishga tushirish (paneldan)
 *
 * Har bir test:
 *   - precondition: dastlabki holatni o'rnatadi
 *   - act:           harakat bajaradi
 *   - assert:        kutilgan natijani tekshiradi
 *   - cleanup:       keyingi test uchun holatni qaytaradi
 * --------------------------------------------------------------------------
 */

'use strict';

const store = require('../data/store');
const reception = require('../services/receptionService');
const housekeeping = require('../services/housekeepingService');
const roomService = require('../services/roomService');
const maintenance = require('../services/maintenanceService');

function pass(message, details = {}) {
  return { passed: true, message, details };
}
function fail(message, details = {}) {
  return { passed: false, message, details };
}

const SCENARIOS = {
  // -------------------------------------------------------------------------
  'TS-01': {
    id: 'TS-01',
    title: 'Mehmon 1-qavatda ikki kishilik xona so\'rab check-in qiladi',
    description: 'Tizim 1-qavatdagi eng uzoq toza ikki kishilik xonani tayinlaydi. Xona holati "Banda" ga o\'zgaradi.',
    run: async () => {
      const result = reception.checkIn({
        guestName: 'Test Mehmon TS-01',
        roomType: 'double',
        nights: 2,
        floorPreference: 1,
        proximityPreference: 'none',
      });
      if (!result.success) return fail(result.error);
      if (result.room.floor !== 1) {
        return fail(`Kutilgan: 1-qavat, olindi: ${result.room.floor}-qavat`);
      }
      if (result.room.type !== 'double') {
        return fail(`Kutilgan: double, olindi: ${result.room.type}`);
      }
      if (result.room.status !== 'occupied') {
        return fail(`Kutilgan: occupied, olindi: ${result.room.status}`);
      }
      // Cleanup
      reception.checkOut(result.room.number);
      housekeeping.markClean(result.room.number);
      return pass(`Xona ${result.room.number} tayinlandi (${result.assignmentReason})`, { roomNumber: result.room.number });
    },
  },

  // -------------------------------------------------------------------------
  'TS-02': {
    id: 'TS-02',
    title: 'Mehmon check-out qiladi — hisob hisoblanadi, xona iflos bo\'ladi',
    description: 'Tizim umumiy hisobni hisoblaydi. Xona holati "Iflos"ga o\'zgaradi. "Xona bo\'shatildi" hodisasi nashr etiladi. Tozalash hodisani qabul qiladi va navbatga qo\'shadi.',
    run: async () => {
      // Precondition: yangi mehmonni check-in qilamiz
      const checkIn = reception.checkIn({
        guestName: 'Test Mehmon TS-02', roomType: 'double', nights: 2,
        proximityPreference: 'none',
      });
      if (!checkIn.success) return fail('Precondition: check-in muvaffaqiyatsiz');
      const roomNumber = checkIn.room.number;

      const result = reception.checkOut(roomNumber);
      if (!result.success) return fail(result.error);

      const room = store.getRoom(roomNumber);
      if (room.status !== 'dirty') return fail(`Kutilgan: dirty, olindi: ${room.status}`);
      if (!result.bill || result.bill.total <= 0) return fail('Hisob noto\'g\'ri hisoblandi');

      // Cleanup
      housekeeping.markClean(roomNumber);

      return pass(`Hisob: ${result.bill.total.toLocaleString()} UZS, ${result.bill.nights} tun, xona iflos`,
        { bill: result.bill, queueSize: housekeeping.getQueue().length });
    },
  },

  // -------------------------------------------------------------------------
  'TS-03': {
    id: 'TS-03',
    title: 'Tozalovchi xonani toza deb belgilaydi',
    description: 'Xona holati Iflosdan Tozalanmoqda ga so\'ngra Tozaga o\'zgaradi. Yangi tayinlash uchun mavjud bo\'ladi.',
    run: async () => {
      // Precondition: iflos xona yarataylik
      const checkIn = reception.checkIn({
        guestName: 'Test Mehmon TS-03', roomType: 'single', nights: 1,
        proximityPreference: 'none',
      });
      if (!checkIn.success) return fail('Precondition: check-in');
      const roomNumber = checkIn.room.number;
      reception.checkOut(roomNumber);

      const start = housekeeping.startCleaning(roomNumber);
      if (!start.success) return fail(`startCleaning: ${start.error}`);
      if (store.getRoom(roomNumber).status !== 'cleaning') return fail('Tozalanmoqda holati o\'rnatilmadi');

      const done = housekeeping.markClean(roomNumber);
      if (!done.success) return fail(`markClean: ${done.error}`);
      if (store.getRoom(roomNumber).status !== 'clean') return fail('Toza holati o\'rnatilmadi');

      return pass(`Xona ${roomNumber}: dirty -> cleaning -> clean`, { roomNumber });
    },
  },

  // -------------------------------------------------------------------------
  'TS-04': {
    id: 'TS-04',
    title: 'Xona xizmati buyurtmasi — 2 ta qahva va sandvich',
    description: 'Buyurtma Qabul qilindi -> Tayyorlanmoqda -> Yetkazilmoqda -> Yetkazildi holatlari orqali o\'tadi.',
    run: async () => {
      const checkIn = reception.checkIn({
        guestName: 'Test Mehmon TS-04', roomType: 'single', nights: 1,
        proximityPreference: 'none',
      });
      if (!checkIn.success) return fail('Precondition: check-in');
      const roomNumber = checkIn.room.number;

      const order = roomService.createOrder({
        roomNumber,
        items: [
          { itemId: 'coffee', quantity: 2 },
          { itemId: 'sandwich', quantity: 1 },
        ],
      });
      if (!order.success) return fail(order.error);
      if (order.order.total !== 30000 * 2 + 65000) {
        return fail(`Jami noto'g'ri: kutilgan ${30000 * 2 + 65000}, olindi ${order.order.total}`);
      }

      // 3 ta keyingi bosqich
      const a1 = roomService.advanceOrder(order.order.id);
      const a2 = roomService.advanceOrder(order.order.id);
      const a3 = roomService.advanceOrder(order.order.id);
      if (!a3.success || a3.order.status !== 'delivered') return fail('Yetkazildi holatiga o\'tmadi');

      // Cleanup
      reception.checkOut(roomNumber);
      housekeeping.markClean(roomNumber);

      return pass(`Buyurtma ${order.order.id} yetkazildi (jami: ${order.order.total.toLocaleString()} UZS)`,
        { order: order.order });
    },
  },

  // -------------------------------------------------------------------------
  'TS-05': {
    id: 'TS-05',
    title: 'Texnik xizmat: singan dush, shoshilinchlik Kritik',
    description: 'Muammo texnik xizmat ustuvorlik navbatining oldiga kiradi va keyingi mavjud texnikka tayinlanadi.',
    run: async () => {
      const result = maintenance.report({
        roomNumber: 105,
        description: 'TS-05: 105-xonada dush singan, suv tushmayapti',
        urgency: 'critical',
        category: 'plumbing',
      });
      if (!result.success) return fail(result.error);
      const queue = maintenance.getQueue();
      const first = queue[0];
      if (first.id !== result.request.id && first.urgency !== 'critical') {
        return fail('Kritik so\'rov navbat oldida emas');
      }
      if (!result.request.assignedTo) return fail('Texnikka tayinlanmadi');

      // Cleanup
      maintenance.resolve(result.request.id, 'Test cleanup');
      return pass(`So'rov ${result.request.id} tayinlandi (texnik: ${result.request.assignedToName})`,
        { request: result.request, queuePosition: 0 });
    },
  },

  // -------------------------------------------------------------------------
  'TS-06': {
    id: 'TS-06',
    title: 'Ikki mehmon bir vaqtda bir xil xona turini so\'raydi',
    description: 'Tizim har bir mehmonga turli xonalarni tayinlaydi. Hech qanday xona ikki marta bron qilinmaydi.',
    run: async () => {
      const a = reception.checkIn({
        guestName: 'TS-06 Mehmon A', roomType: 'single', nights: 1, proximityPreference: 'none',
      });
      const b = reception.checkIn({
        guestName: 'TS-06 Mehmon B', roomType: 'single', nights: 1, proximityPreference: 'none',
      });
      if (!a.success || !b.success) return fail('Birinchi yoki ikkinchi check-in muvaffaqiyatsiz');
      if (a.room.number === b.room.number) return fail('Ikki mehmonga bir xil xona tayinlandi!');

      // Cleanup
      reception.checkOut(a.room.number); housekeeping.markClean(a.room.number);
      reception.checkOut(b.room.number); housekeeping.markClean(b.room.number);

      return pass(`A -> ${a.room.number}, B -> ${b.room.number} (farqli xonalar)`,
        { roomA: a.room.number, roomB: b.room.number });
    },
  },

  // -------------------------------------------------------------------------
  'TS-07': {
    id: 'TS-07',
    title: 'So\'ralgan turdagi barcha xonalar band',
    description: 'Tizim aniq "xonalar mavjud emas" xabarini qaytaradi. Ishdan chiqish yo\'q.',
    run: async () => {
      // Barcha "suite" xonalarini band qilamiz (faqat 2 ta suite bor: 204, 205)
      // 204 demo mehmoni bilan band, 205ni biz band qilamiz
      const fillers = [];
      const suites = store.getRooms().filter((r) => r.type === 'suite' && r.status === 'clean');
      for (const s of suites) {
        const ci = reception.checkIn({
          guestName: `TS-07 Filler ${s.number}`, roomType: 'suite', nights: 1, proximityPreference: 'none',
        });
        if (ci.success) fillers.push(ci.room.number);
      }

      const result = reception.checkIn({
        guestName: 'TS-07 Asosiy', roomType: 'suite', nights: 1, proximityPreference: 'none',
      });

      // Cleanup
      for (const n of fillers) {
        reception.checkOut(n);
        housekeeping.markClean(n);
      }

      if (result.success) return fail('Tizim band xonani tayinladi (xato!)');
      if (!result.error || !result.error.includes('band')) {
        return fail(`Aniq xato xabari kutilgan, olindi: "${result.error}"`);
      }
      return pass(`Tizim to'g'ri rad etdi: "${result.error}"`, { error: result.error });
    },
  },

  // -------------------------------------------------------------------------
  'TS-08': {
    id: 'TS-08',
    title: 'Noto\'g\'ri kiritish — tizim barqaror qoladi',
    description: 'Tizim aniq tekshiruv xatosi bilan kiritishni rad etadi va keyingi kiritish uchun tayyor qoladi.',
    run: async () => {
      const { validateCheckIn, validateRoomNumber } = require('../utils/validator');

      // Noto'g'ri xona raqami
      try {
        validateRoomNumber(999);
        return fail('999-xona qabul qilindi (xato!)');
      } catch (err) { /* kutilgan */ }

      // Bo'sh ism
      try {
        validateCheckIn({ guestName: '', roomType: 'single', nights: 1 });
        return fail('Bo\'sh ism qabul qilindi (xato!)');
      } catch (err) { /* kutilgan */ }

      // XSS urinishi
      try {
        validateCheckIn({ guestName: '<script>alert(1)</script>', roomType: 'single', nights: 1 });
        return fail('XSS qabul qilindi (xato!)');
      } catch (err) { /* kutilgan */ }

      // Noto'g'ri tun soni
      try {
        validateCheckIn({ guestName: 'Test', roomType: 'single', nights: -5 });
        return fail('Manfiy tun qabul qilindi (xato!)');
      } catch (err) { /* kutilgan */ }

      // Tizim hali ham ishlayotganligini tekshiramiz
      const okCheckIn = reception.checkIn({
        guestName: 'TS-08 Yaxshi mehmon', roomType: 'single', nights: 1, proximityPreference: 'none',
      });
      if (!okCheckIn.success) return fail('Tekshiruv xatosidan keyin tizim buzildi');

      // Cleanup
      reception.checkOut(okCheckIn.room.number);
      housekeeping.markClean(okCheckIn.room.number);

      return pass('Tizim 4 ta noto\'g\'ri kiritishni rad etdi va keyingi to\'g\'ri kiritishni qabul qildi',
        { rejectedInputs: 4 });
    },
  },
};

async function runOne(id) {
  const scenario = SCENARIOS[id];
  if (!scenario) return { id, passed: false, message: 'Stsenariy topilmadi' };
  const startedAt = Date.now();
  try {
    const result = await scenario.run();
    const elapsed = Date.now() - startedAt;
    return { id, title: scenario.title, description: scenario.description,
      ...result, elapsedMs: elapsed, ranAt: new Date().toISOString() };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    return { id, title: scenario.title, description: scenario.description,
      passed: false, message: `Bajarish xatosi: ${err.message}`, elapsedMs: elapsed,
      ranAt: new Date().toISOString() };
  }
}

async function runAll() {
  const results = [];
  for (const id of Object.keys(SCENARIOS)) {
    const r = await runOne(id);
    results.push(r);
  }
  const passed = results.filter((r) => r.passed).length;
  return { results, summary: { total: results.length, passed, failed: results.length - passed } };
}

function listScenarios() {
  return Object.values(SCENARIOS).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
  }));
}

// CLI orqali ishga tushganda
if (require.main === module) {
  (async () => {
    console.log('\n=== HotelOS Test Stsenariylari (TS-01 ... TS-08) ===\n');
    const { results, summary } = await runAll();
    for (const r of results) {
      const icon = r.passed ? '✓' : '✗';
      const color = r.passed ? '\x1b[32m' : '\x1b[31m';
      console.log(`${color}${icon}\x1b[0m  ${r.id}  ${r.title}`);
      console.log(`     ${r.message}`);
      console.log(`     vaqt: ${r.elapsedMs}ms\n`);
    }
    console.log(`\nJami: ${summary.passed}/${summary.total} muvaffaqiyatli, ${summary.failed} muvaffaqiyatsiz\n`);
    process.exit(summary.failed === 0 ? 0 : 1);
  })();
}

module.exports = { runOne, runAll, listScenarios };
