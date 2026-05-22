/**
 * housekeepingService.js
 * --------------------------------------------------------------------------
 * Tozalash Servisi. Vazifalar:
 *   - 'guest.checked_out' va 'room.cleaning_required' hodisalarini qabul qilish
 *   - Xonalarni tozalash navbatiga (FIFO) qo'shish
 *   - Tozalovchilarga avtomatik tayinlash
 *   - Holat o'tishlari: cleaning_required -> cleaning -> inspection
 *
 * Eslatma: markClean endi xonani 'available' emas, 'inspection' holatiga
 * o'tkazadi. Qabul xodimi tasdiqlaganidan keyin 'available' bo'ladi.
 * --------------------------------------------------------------------------
 */

'use strict';

const broker = require('../broker/messageBroker');
const store = require('../data/store');
const logger = require('../utils/logger');

class HousekeepingService {
  constructor() {
    this.name = 'housekeeping';
    this.cleaningQueue = []; // FIFO navbat
    this._subscribe();
    this._restoreQueueFromStore();
    logger.info('[HOUSEKEEPING] Servis ishga tushdi');
  }

  _subscribe() {
    // Mehmon check-out qilganda — checkOut allaqachon statusni o'zgartirgan,
    // biz faqat navbatga qo'shamiz
    broker.subscribe('guest.checked_out', (event) => {
      const roomNumber = event.payload.room?.number;
      if (roomNumber) {
        this._enqueueWithoutStatusChange(roomNumber, 'guest_checkout');
      }
    });

    // 12-soatlik tekshiruvdan
    broker.subscribe('room.cleaning_required', (event) => {
      const roomNumber = event.payload.roomNumber;
      this._enqueueWithoutStatusChange(roomNumber, 'periodic_check');
    });
  }

  /** Server qayta ishga tushganda mavjud cleaning_required xonalarni navbatga qo'shamiz */
  _restoreQueueFromStore() {
    for (const r of store.getRooms()) {
      if (r.status === 'cleaning_required') {
        this.cleaningQueue.push({
          roomNumber: r.number,
          reason: 'restored',
          addedAt: r.dirtyAt || Date.now(),
        });
      }
    }
  }

  /** Faqat navbatga qo'shadi, statusni o'zgartirmaydi (status allaqachon tozalash_kk) */
  _enqueueWithoutStatusChange(roomNumber, reason) {
    const room = store.getRoom(roomNumber);
    if (!room) return null;
    if (room.status !== 'cleaning_required') return null;
    if (this.cleaningQueue.find((q) => q.roomNumber === roomNumber)) return null;

    const entry = { roomNumber, reason, addedAt: Date.now() };
    this.cleaningQueue.push(entry);
    this._tryAssignCleaner(entry);
    return entry;
  }

  /**
   * Qo'lda navbatga qo'shish (Reception yoki manager tomonidan).
   * Statusni cleaning_required qiladi (agar boshqacha bo'lsa).
   */
  addToCleaningQueue(roomNumber, reason = 'manual') {
    const room = store.getRoom(roomNumber);
    if (!room) return null;
    if (room.status === 'occupied') {
      logger.warn(`[HOUSEKEEPING] ${roomNumber}-xona band, navbatga qo'shilmaydi`);
      return null;
    }
    if (room.status === 'cleaning' || room.status === 'maintenance') {
      return null;
    }
    if (this.cleaningQueue.find((q) => q.roomNumber === roomNumber)) {
      return null;
    }

    // Status 'available' yoki 'inspection' bo'lsa va sabab 'guest_checkout' bo'lsa, bekor qilamiz
    if (room.status !== 'cleaning_required' && reason === 'guest_checkout') {
      logger.debug(`[HOUSEKEEPING] ${roomNumber} allaqachon ${room.status}, navbatga qo'shilmaydi`);
      return null;
    }

    // Status cleaning_required emas bo'lsa, qilamiz
    if (room.status !== 'cleaning_required') {
      const oldStatus = room.status;
      store.updateRoom(roomNumber, { status: 'cleaning_required', dirtyAt: Date.now() });
      broker.publish('room.status_changed', {
        roomNumber, oldStatus, newStatus: 'cleaning_required',
        changedBy: 'housekeeping', reason,
      });
    }

    const entry = { roomNumber, reason, addedAt: Date.now() };
    this.cleaningQueue.push(entry);
    this._tryAssignCleaner(entry);
    return entry;
  }

  _tryAssignCleaner(queueEntry) {
    const housekeepers = store.getHousekeepers();
    const free = housekeepers.find((h) => h.available);
    if (!free) return null;
    queueEntry.assignedTo = free.id;
    queueEntry.assignedToName = free.name;
    queueEntry.assignedAt = Date.now();
    return free;
  }

  /** Tozalashni boshlash: cleaning_required -> cleaning */
  startCleaning(roomNumber, byUser = 'system') {
    const room = store.getRoom(roomNumber);
    if (!room) return { success: false, error: `${roomNumber}-xona topilmadi` };
    if (room.status !== 'cleaning_required') {
      return { success: false, error: `${roomNumber}-xona tozalash uchun tayyor emas (joriy: ${room.status})` };
    }
    const oldStatus = room.status;
    store.updateRoom(roomNumber, {
      status: 'cleaning',
      cleaningStartedAt: Date.now(),
      cleanedBy: byUser,
    });
    broker.publish('room.status_changed', {
      roomNumber, oldStatus, newStatus: 'cleaning',
      changedBy: 'housekeeping', actor: byUser,
    });
    logger.info(`[HOUSEKEEPING] ${roomNumber}-xona tozalanmoqda (${byUser})`);
    return { success: true, room: store.getRoom(roomNumber) };
  }

  /** Tozalashni yakunlash: cleaning -> inspection (qabul tekshirishi kerak) */
  markClean(roomNumber, byUser = 'system') {
    const room = store.getRoom(roomNumber);
    if (!room) return { success: false, error: `${roomNumber}-xona topilmadi` };
    if (room.status !== 'cleaning' && room.status !== 'cleaning_required') {
      return { success: false, error: `${roomNumber}-xona tozalanmagan (joriy: ${room.status})` };
    }
    const oldStatus = room.status;
    const cleaningDurationMs = room.cleaningStartedAt ? Date.now() - room.cleaningStartedAt : null;

    store.updateRoom(roomNumber, {
      status: 'inspection',
      lastCleanedAt: Date.now(),
      inspectionStartedAt: Date.now(),
      dirtyAt: null,
      cleaningStartedAt: null,
      lastCleaningDurationMs: cleaningDurationMs,
      lastCleanedBy: byUser,
    });

    // Navbatdan olib tashlaymiz
    this.cleaningQueue = this.cleaningQueue.filter((q) => q.roomNumber !== roomNumber);

    // Statistikani yangilaymiz
    store.incrementStat('totalCleanings');

    broker.publish('room.status_changed', {
      roomNumber, oldStatus, newStatus: 'inspection',
      changedBy: 'housekeeping', actor: byUser,
    });
    broker.publish('notification.created', {
      type: 'inspection_required',
      severity: 'info',
      message: `${roomNumber}-xona tozalandi va qabul tomonidan tekshirilishi kutilmoqda`,
      roomNumber,
    });

    logger.info(`[HOUSEKEEPING] ${roomNumber}-xona tozalandi -> TEKSHIRUVDA`);
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
