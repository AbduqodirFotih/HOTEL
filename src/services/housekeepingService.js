/**
 * housekeepingService.js
 * --------------------------------------------------------------------------
 * Tozalash Servisi. Vazifalar:
 *   - Brokerdan 'guest.checked_out' xabarlarini qabul qiladi (subscribe)
 *   - Xonalarni tozalash navbatiga (FIFO Queue) qo'shadi
 *   - Tozalovchilarga avtomatik tayinlash
 *   - Xona holatlarini boshqarish: dirty -> cleaning -> clean
 *   - Har bir holat o'zgarishini brokerga nashr etadi
 *
 * 12 soatlik qoida:
 *   - Notification servisi davriy ravishda toza turgan xonalarni tekshiradi
 *   - Threshold dan oshganlar uchun avtomatik 'iflos' bayrog'i qo'yiladi
 *     (yoki bildirishnoma yuboriladi — sozlamaga qarab)
 * --------------------------------------------------------------------------
 */

'use strict';

const broker = require('../broker/messageBroker');
const store = require('../data/store');
const logger = require('../utils/logger');

class HousekeepingService {
  constructor() {
    this.name = 'housekeeping';
    this.cleaningQueue = []; // FIFO navbat (massiv sifatida)
    this._subscribe();
    logger.info('[HOUSEKEEPING] Servis ishga tushdi');
  }

  _subscribe() {
    // Mehmon check-out qilganda xonani tozalash navbatiga qo'shamiz
    broker.subscribe('guest.checked_out', (event) => {
      const roomNumber = event.payload.room?.number;
      if (roomNumber) {
        this.addToCleaningQueue(roomNumber, 'guest_checkout');
      }
    });

    // 12 soat o'tib tozalash kerakligi bildirilganda
    broker.subscribe('room.cleaning_required', (event) => {
      const roomNumber = event.payload.roomNumber;
      // Avtomatik qo'shish faqat sozlamada yoqilgan bo'lsa
      const settings = store.getSettings();
      if (settings.autoNotifyHousekeeping) {
        this.addToCleaningQueue(roomNumber, 'periodic_check');
      }
    });
  }

  /**
   * Xonani tozalash navbatiga qo'shadi.
   * MUHIM: Bu yerda dastlab "yarish holati" (race condition) bor edi —
   * 'guest.checked_out' hodisasi kechiktirilgan tarzda kelganida, agar
   * boshqa servis allaqachon xonani 'clean' yoki 'cleaning' holatiga
   * o'tkazib bo'lgan bo'lsa, biz uni qaytadan 'dirty' qilib qo'yardik.
   * Tuzatish: faqat 'dirty' yoki 'manual reason' bilan kelgan toza
   * xonalarni navbatga qo'shamiz, boshqa holatlarda statusni o'zgartirmaymiz.
   */
  addToCleaningQueue(roomNumber, reason = 'manual') {
    const room = store.getRoom(roomNumber);
    if (!room) return null;
    if (room.status === 'occupied') {
      logger.warn(`[HOUSEKEEPING] ${roomNumber}-xona band, navbatga qo'shilmaydi`);
      return null;
    }
    if (room.status === 'cleaning' || room.status === 'maintenance') {
      // Allaqachon ishlanmoqda — qayta qo'shmaymiz
      return null;
    }
    if (this.cleaningQueue.find((q) => q.roomNumber === roomNumber)) {
      // Allaqachon navbatda
      return null;
    }

    // Status 'clean' bo'lsa va sabab avtomatik checkout bo'lsa — bekor qilamiz
    // (boshqa servis bizdan keyin tozalab ulgurgan)
    if (room.status === 'clean' && reason === 'guest_checkout') {
      logger.debug(`[HOUSEKEEPING] ${roomNumber} allaqachon toza, navbatga qo'shilmaydi`);
      return null;
    }

    // Status 'clean' bo'lsa va sabab boshqa (masalan, 12 soat o'tdi yoki manual) — dirty qilamiz
    if (room.status !== 'dirty') {
      const oldStatus = room.status;
      store.updateRoom(roomNumber, { status: 'dirty', dirtyAt: Date.now() });
      broker.publish('room.status_changed', {
        roomNumber,
        oldStatus,
        newStatus: 'dirty',
        changedBy: 'housekeeping',
        reason,
      });
    }

    const queueEntry = {
      roomNumber,
      reason,
      addedAt: Date.now(),
    };
    this.cleaningQueue.push(queueEntry);

    // Avtomatik tayinlash
    this._tryAssignCleaner(queueEntry);

    return queueEntry;
  }

  _tryAssignCleaner(queueEntry) {
    const housekeepers = store.getHousekeepers();
    const free = housekeepers.find((h) => h.available);
    if (!free) {
      logger.info(`[HOUSEKEEPING] ${queueEntry.roomNumber} navbatda — bo'sh tozalovchi yo'q`);
      return null;
    }
    queueEntry.assignedTo = free.id;
    queueEntry.assignedAt = Date.now();
    // Hozircha biz hech bir tozalovchini "band" qilmaymiz (demo uchun) — ular bir vaqtning o'zida
    // ko'p xonani tozalashlari mumkin.
    return free;
  }

  /** Tozalashni boshlash: dirty -> cleaning */
  startCleaning(roomNumber) {
    const room = store.getRoom(roomNumber);
    if (!room) return { success: false, error: `${roomNumber}-xona topilmadi` };
    if (room.status !== 'dirty') {
      return { success: false, error: `${roomNumber}-xona iflos emas (joriy: ${room.status})` };
    }
    const oldStatus = room.status;
    store.updateRoom(roomNumber, { status: 'cleaning', cleaningStartedAt: Date.now() });
    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'cleaning',
      changedBy: 'housekeeping',
    });
    logger.info(`[HOUSEKEEPING] ${roomNumber}-xona tozalanmoqda`);
    return { success: true, room: store.getRoom(roomNumber) };
  }

  /** Tozalashni yakunlash: cleaning -> clean */
  markClean(roomNumber) {
    const room = store.getRoom(roomNumber);
    if (!room) return { success: false, error: `${roomNumber}-xona topilmadi` };
    if (room.status !== 'cleaning' && room.status !== 'dirty') {
      return { success: false, error: `${roomNumber}-xona tozalanmagan (joriy: ${room.status})` };
    }
    const oldStatus = room.status;
    store.updateRoom(roomNumber, {
      status: 'clean',
      lastCleanedAt: Date.now(),
      dirtyAt: null,
      cleaningStartedAt: null,
    });

    // Navbatdan olib tashlaymiz
    this.cleaningQueue = this.cleaningQueue.filter((q) => q.roomNumber !== roomNumber);

    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'clean',
      changedBy: 'housekeeping',
    });

    // "Tozalandi" bildirishnomasi (har 12 soatlik tsikl talabi uchun)
    broker.publish('notification.created', {
      type: 'room_cleaned',
      severity: 'info',
      message: `${roomNumber}-xona tozalandi va mehmon qabul qilishga tayyor.`,
      roomNumber,
    });

    logger.info(`[HOUSEKEEPING] ${roomNumber}-xona TOZA deb belgilandi`);
    return { success: true, room: store.getRoom(roomNumber) };
  }

  /** Xonani texnik xizmatga belgilash */
  markMaintenance(roomNumber) {
    const room = store.getRoom(roomNumber);
    if (!room) return { success: false, error: `${roomNumber}-xona topilmadi` };
    if (room.status === 'occupied') {
      return { success: false, error: `${roomNumber}-xona band, mehmon chiqishi kerak` };
    }
    const oldStatus = room.status;
    store.updateRoom(roomNumber, { status: 'maintenance' });
    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'maintenance',
      changedBy: 'housekeeping',
    });
    return { success: true, room: store.getRoom(roomNumber) };
  }

  getQueue() {
    return this.cleaningQueue.map((q) => ({
      ...q,
      room: store.getRoom(q.roomNumber),
    }));
  }
}

module.exports = new HousekeepingService();
