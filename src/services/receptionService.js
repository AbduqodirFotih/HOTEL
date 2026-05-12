/**
 * receptionService.js
 * --------------------------------------------------------------------------
 * Qabul Servisi. Vazifalar:
 *   - Mehmonni check-in qilish (xona tayinlash algoritmini ishga tushiradi)
 *   - Mehmonni check-out qilish (hisob-kitob algoritmini ishga tushiradi)
 *   - Xona inventari so'rovlarini boshqarish
 *
 * Hodisalar nashr etadi:
 *   - guest.checked_in
 *   - guest.checked_out
 *   - room.status_changed
 *
 * Bu servis Tozalash yoki boshqa servislarni TO'G'RIDAN-TO'G'RI chaqirmaydi.
 * Faqat broker orqali xabar tarqatadi.
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const broker = require('../broker/messageBroker');
const store = require('../data/store');
const logger = require('../utils/logger');
const { assignRoom } = require('../algorithms/roomAssignment');
const { calculateBill } = require('../algorithms/billing');

function genId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

class ReceptionService {
  constructor() {
    this.name = 'reception';
    logger.info('[RECEPTION] Servis ishga tushdi');
  }

  /**
   * Mehmonni check-in qilish.
   * 1) Xona tayinlash algoritmini ishga tushiradi
   * 2) Mehmon yozuvi yaratadi
   * 3) Xona holatini "occupied" ga o'zgartiradi
   * 4) Hodisalarni nashr etadi
   */
  checkIn(criteria) {
    const rooms = store.getRooms();
    const { room, reason } = assignRoom(rooms, criteria);

    if (!room) {
      logger.warn(`[RECEPTION] Check-in muvaffaqiyatsiz: ${reason}`);
      return { success: false, error: reason };
    }

    const guest = {
      id: genId('guest'),
      name: criteria.guestName,
      roomNumber: room.number,
      checkInAt: Date.now(),
      nights: criteria.nights,
      paymentMethod: criteria.paymentMethod || 'card',
      preferences: {
        floor: criteria.floorPreference,
        proximity: criteria.proximityPreference,
      },
      extraCharges: [],
    };

    store.addGuest(guest);

    // Xona holatini yangilash
    const oldStatus = room.status;
    store.updateRoom(room.number, {
      status: 'occupied',
      occupiedBy: guest.id,
      occupiedAt: Date.now(),
    });

    store.incrementStat('totalCheckIns');

    // Hodisalarni nashr etamiz
    broker.publish('guest.checked_in', {
      guest,
      room: { number: room.number, type: room.type, floor: room.floor },
      assignmentReason: reason,
    });

    broker.publish('room.status_changed', {
      roomNumber: room.number,
      oldStatus,
      newStatus: 'occupied',
      changedBy: 'reception',
    });

    logger.info(`[RECEPTION] Check-in: ${guest.name} -> ${room.number}-xona (${reason})`);

    return {
      success: true,
      guest,
      room: { ...store.getRoom(room.number) },
      assignmentReason: reason,
    };
  }

  /**
   * Mehmonni check-out qilish.
   * 1) Hisob-kitob algoritmini ishga tushiradi
   * 2) Mehmon yozuvini olib tashlaydi
   * 3) Xona holatini "dirty" ga o'zgartiradi
   * 4) "room.status_changed" va "guest.checked_out" hodisalarini nashr etadi
   *    -> Tozalash servisi xabarni qabul qiladi
   */
  checkOut(roomNumber, { extraCharges, discount } = {}) {
    const room = store.getRoom(roomNumber);
    if (!room) {
      return { success: false, error: `${roomNumber}-xona topilmadi` };
    }
    if (room.status !== 'occupied') {
      return { success: false, error: `${roomNumber}-xona band emas (joriy holati: ${room.status})` };
    }

    const guest = store.getGuests().find((g) => g.roomNumber === roomNumber);
    if (!guest) {
      return { success: false, error: `${roomNumber}-xonada mehmon yozuvi yo'q` };
    }

    // Qo'shimcha to'lovlarni mehmon yozuviga qo'shamiz
    const allExtras = [...(guest.extraCharges || []), ...(extraCharges || [])];

    const bill = calculateBill({
      guest,
      room,
      orders: store.getOrders(),
      extraCharges: allExtras,
      discount,
    });

    // Mehmonni olib tashlaymiz, xona "iflos" bo'ladi
    store.removeGuest(guest.id);
    const oldStatus = room.status;
    store.updateRoom(roomNumber, {
      status: 'dirty',
      occupiedBy: null,
      occupiedAt: null,
      dirtyAt: Date.now(),
    });

    store.incrementStat('totalCheckOuts');
    store.incrementStat('totalRevenue', bill.total);

    // Hodisalar
    broker.publish('guest.checked_out', { guest, room: { number: roomNumber }, bill });
    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'dirty',
      changedBy: 'reception',
    });

    logger.info(`[RECEPTION] Check-out: ${guest.name} (${roomNumber}) -> ${bill.total.toLocaleString()} UZS`);

    return { success: true, bill };
  }

  /** Inventar so'rovi — barcha xonalar holati */
  getInventory() {
    const rooms = store.getRooms();
    const summary = {
      total: rooms.length,
      clean: 0,
      dirty: 0,
      cleaning: 0,
      occupied: 0,
      maintenance: 0,
    };
    for (const r of rooms) summary[r.status] = (summary[r.status] || 0) + 1;
    return { rooms, summary };
  }
}

module.exports = new ReceptionService();
