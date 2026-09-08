/**
 * testRunner.js
 * --------------------------------------------------------------------------
 * Topshiriqning 8 ta test stsenariyini (TS-01 ... TS-08) avtomatik bajaradi.
 *
 * Yangi xona workflow (5 bosqich):
 *   available -> [check-in] -> occupied
 *   occupied -> [check-out] -> cleaning_required
 *   cleaning_required -> [start] -> cleaning
 *   cleaning -> [complete] -> inspection
 *   inspection -> [confirm] -> available (qabul tomonidan)
 * --------------------------------------------------------------------------
 */

'use strict';

const store = require('../data/store');
const reception = require('../services/receptionService');
const housekeeping = require('../services/housekeepingService');
const roomService = require('../services/roomService');
const maintenance = require('../services/maintenanceService');

function pass(message, details = {}) { return { passed: true, message, details }; }
function fail(message, details = {}) { return { passed: false, message, details }; }

/** Test xonasini to'liq tozalab, available holatga qaytaramiz */
function fullReset(roomNumber) {
  const room = store.getRoom(roomNumber);
  if (!room) return;
  if (room.status === 'occupied') reception.checkOut(roomNumber);
  if (room.status === 'cleaning_required') housekeeping.startCleaning(roomNumber, 'test');
  if (room.status === 'cleaning') housekeeping.markClean(roomNumber, 'test');
  if (room.status === 'inspection') reception.confirmAvailable(roomNumber);
}

const SCENARIOS = {

  // -------------------------------------------------------------------------
  'TS-01': {
    id: 'TS-01',
    title: 'Mehmon 1-qavatda ikki kishilik xona so\'rab check-in qiladi',
    description: 'Tizim 1-qavatdagi eng uzoq toza ikki kishilik xonani tayinlaydi. Xona holati "Band" ga o\'zgaradi.',
    run: async () => {
      const result = reception.checkIn({
        guestName: 'Test Mehmon TS-01',
        roomType: 'double',
        nights: 2,
        floorPreference: 1,
        proximityPreference: 'none',
      });
      if (!result.success) return fail(result.error);
      if (result.room.floor !== 1) return fail(`Kutilgan: 1-qavat, olindi: ${result.room.floor}`);
      if (result.room.type !== 'double') return fail(`Kutilgan: double, olindi: ${result.room.type}`);
      if (result.room.status !== 'occupied') return fail(`Kutilgan: occupied, olindi: ${result.room.status}`);
      fullReset(result.room.number);
      return pass(`Xona ${result.room.number} tayinlandi (${result.assignmentReason})`,
        { roomNumber: result.room.number });
    },
  },

  // -------------------------------------------------------------------------
  'TS-02': {
    id: 'TS-02',
    title: 'Mehmon check-out qiladi — hisob hisoblanadi, xona "Tozalash kerak" bo\'ladi',
    description: 'Tizim hisob hisoblanadi, xona holati "Tozalash kerak" (cleaning_required) ga o\'zgaradi va tozalovchiga bildirishnoma yuboriladi.',
    run: async () => {
      const checkIn = reception.checkIn({
        guestName: 'Test Mehmon TS-02', roomType: 'double', nights: 2,
        proximityPreference: 'none',
      });
      if (!checkIn.success) return fail('Precondition: check-in muvaffaqiyatsiz');
      const roomNumber = checkIn.room.number;

      const result = reception.checkOut(roomNumber);
      if (!result.success) return fail(result.error);

      const room = store.getRoom(roomNumber);
      if (room.status !== 'cleaning_required') {
        return fail(`Kutilgan: cleaning_required, olindi: ${room.status}`);
      }
      if (!result.bill || result.bill.total <= 0) return fail('Hisob noto\'g\'ri hisoblandi');

      fullReset(roomNumber);
      return pass(
        `Hisob: ${result.bill.total.toLocaleString()} UZS, ${result.bill.nights} tun, xona tozalash kerak`,
        { bill: result.bill, queueSize: housekeeping.getQueue().length },
      );
    },
  },

  // -------------------------------------------------------------------------
  'TS-03': {
    id: 'TS-03',
    title: 'To\'liq tozalash tsikli: tozalash_kk → tozalanmoqda → tekshiruvda → bo\'sh',
    description: 'Tozalovchi tozalashni boshlaydi va yakunlaydi, qabul xodimi tasdiqlab xonani yangi mehmonlar uchun mavjud qiladi.',
    run: async () => {
      const checkIn = reception.checkIn({
        guestName: 'Test Mehmon TS-03', roomType: 'single', nights: 1,
        proximityPreference: 'none',
      });
      if (!checkIn.success) return fail('Precondition: check-in');
      const roomNumber = checkIn.room.number;
      reception.checkOut(roomNumber);

      // Bosqich 1: cleaning_required -> cleaning
      const start = housekeeping.startCleaning(roomNumber, 'TestCleaner');
      if (!start.success) return fail(`startCleaning: ${start.error}`);
      if (store.getRoom(roomNumber).status !== 'cleaning') return fail('cleaning holati o\'rnatilmadi');

      // Bosqich 2: cleaning -> inspection
      const done = housekeeping.markClean(roomNumber, 'TestCleaner');
      if (!done.success) return fail(`markClean: ${done.error}`);
      if (store.getRoom(roomNumber).status !== 'inspection') return fail('inspection holati o\'rnatilmadi');

      // Bosqich 3: inspection -> available (qabul tasdiqlaydi)
      const confirmed = reception.confirmAvailable(roomNumber);
      if (!confirmed.success) return fail(`confirmAvailable: ${confirmed.error}`);
      if (store.getRoom(roomNumber).status !== 'available') return fail('available holatiga o\'tmadi');

      return pass(
        `Xona ${roomNumber}: cleaning_required → cleaning → inspection → available`,
        { roomNumber },
      );
    },
  },

  // -------------------------------------------------------------------------
  'TS-04': {
    id: 'TS-04',
    title: 'Xona xizmati buyurtmasi — 2 ta qahva va sandvich',
    description: 'Buyurtma Qabul → Tayyorlanmoqda → Yetkazilmoqda → Yetkazildi holatlari orqali o\'tadi.',
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

      roomService.advanceOrder(order.order.id);
      roomService.advanceOrder(order.order.id);
      const a3 = roomService.advanceOrder(order.order.id);
      if (!a3.success || a3.order.status !== 'delivered') return fail('delivered holatiga o\'tmadi');

      fullReset(roomNumber);
      return pass(
        `Buyurtma ${order.order.id} yetkazildi (jami: ${order.order.total.toLocaleString()} UZS)`,
        { order: order.order },
      );
    },
  },

  // -------------------------------------------------------------------------
  'TS-05': {
    id: 'TS-05',
    title: 'Texnik xizmat: singan dush, shoshilinchlik Kritik (4-bosqichli workflow)',
    description: 'open → acknowledged → in_progress → resolved. Kritik so\'rov navbat oldida bo\'ladi.',
    run: async () => {
      const result = maintenance.report({
        roomNumber: 105,
        description: 'TS-05: 105-xonada dush singan, suv tushmayapti',
        urgency: 'critical',
        category: 'plumbing',
      }, 'Test');
      if (!result.success) return fail(result.error);

      // Status 'open' bo'lishi kerak
      if (result.request.status !== 'open') {
        return fail(`Yangi so'rov status 'open' emas: ${result.request.status}`);
      }

      // Navbat oldida bo'lishi kerak (kritik)
      const queue = maintenance.getQueue();
      const first = queue[0];
      if (first.id !== result.request.id) return fail('Kritik so\'rov navbat oldida emas');

      // 4-bosqichli o'tish
      const ack = maintenance.acknowledge(result.request.id, 'TestTech');
      if (!ack.success || ack.request.status !== 'acknowledged') return fail(`acknowledge: ${ack.error || ack.request.status}`);

      const started = maintenance.start(result.request.id, 'TestTech');
      if (!started.success || started.request.status !== 'in_progress') return fail(`start: ${started.error || started.request.status}`);

      const resolved = maintenance.resolve(result.request.id, 'Test cleanup', 'TestTech');
      if (!resolved.success || resolved.request.status !== 'resolved') return fail(`resolve: ${resolved.error || resolved.request.status}`);

      return pass(
        `So'rov ${result.request.id}: open → acknowledged → in_progress → resolved`,
        { request: resolved.request },
      );
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

      fullReset(a.room.number); fullReset(b.room.number);
      return pass(`A → ${a.room.number}, B → ${b.room.number} (farqli xonalar)`,
        { roomA: a.room.number, roomB: b.room.number });
    },
  },

  // -------------------------------------------------------------------------
  'TS-07': {
    id: 'TS-07',
    title: 'So\'ralgan turdagi barcha xonalar band',
    description: 'Tizim aniq "xonalar mavjud emas" xabarini qaytaradi. Ishdan chiqish yo\'q.',
    run: async () => {
      const fillers = [];
      const suites = store.getRooms().filter((r) => r.type === 'suite' && r.status === 'available');
      for (const s of suites) {
        const ci = reception.checkIn({
          guestName: `TS-07 Filler ${s.number}`, roomType: 'suite', nights: 1, proximityPreference: 'none',
        });
        if (ci.success) fillers.push(ci.room.number);
      }

      const result = reception.checkIn({
        guestName: 'TS-07 Asosiy', roomType: 'suite', nights: 1, proximityPreference: 'none',
      });

      for (const n of fillers) fullReset(n);

      if (result.success) return fail('Tizim band xonani tayinladi (xato!)');
      if (!result.error || !result.error.match(/band|tayyor|emas/i)) {
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

      try { validateRoomNumber(999); return fail('999-xona qabul qilindi (xato!)'); } catch (_) {}
      try { validateCheckIn({ guestName: '', roomType: 'single', nights: 1 }); return fail('Bo\'sh ism qabul qilindi'); } catch (_) {}
      try { validateCheckIn({ guestName: '<script>alert(1)</script>', roomType: 'single', nights: 1 }); return fail('XSS qabul qilindi'); } catch (_) {}
      try { validateCheckIn({ guestName: 'Test', roomType: 'single', nights: -5 }); return fail('Manfiy tun qabul qilindi'); } catch (_) {}

      const ok = reception.checkIn({
        guestName: 'TS-08 Yaxshi mehmon', roomType: 'single', nights: 1, proximityPreference: 'none',
      });
      if (!ok.success) return fail('Tekshiruv xatosidan keyin tizim buzildi');
      fullReset(ok.room.number);

      return pass(
        'Tizim 4 ta noto\'g\'ri kiritishni rad etdi va keyingi to\'g\'ri kiritishni qabul qildi',
        { rejectedInputs: 4 },
      );
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
    id: s.id, title: s.title, description: s.description,
  }));
}

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
