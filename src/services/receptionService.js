/**
 * receptionService.js
 * --------------------------------------------------------------------------
 * Qabul Servisi. Vazifalar:
 *   - Mehmonni check-in qilish (xona tayinlash algoritmini ishga tushiradi)
 *   - Mehmonni check-out qilish (hisob-kitob, xona "Tozalash kerak" bo'ladi)
 *   - "Tekshiruvda" turgan xonalarni "Bo'sh" deb tasdiqlash (yangi)
 *   - Manual ravishda xonani "Tozalash kerak" deb belgilash (yangi)
 *
 * Workflow:
 *   available -> [check-in] -> occupied -> [check-out] -> cleaning_required
 *   inspection -> [confirm-available] -> available
 *
 * Hodisalar nashr etadi: guest.checked_in, guest.checked_out,
 *                        room.status_changed
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
   * Algoritm 'available' statusidagi xonalardan eng yaxshini tanlaydi.
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

    const oldStatus = room.status;
    store.updateRoom(room.number, {
      status: 'occupied',
      occupiedBy: guest.id,
      occupiedAt: Date.now(),
    });

    store.incrementStat('totalCheckIns');

    broker.publish('guest.checked_in', {
      guest,
      room: { number: room.number, type: room.type, floor: room.floor },
      assignmentReason: reason,
      actor: 'reception',
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
   * Xona statusi 'cleaning_required' ga o'tadi va tozalovchiga bildirishnoma yuboriladi.
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

    const allExtras = [...(guest.extraCharges || []), ...(extraCharges || [])];

    const bill = calculateBill({
      guest,
      room,
      orders: store.getOrders(),
      extraCharges: allExtras,
      discount,
    });

    store.removeGuest(guest.id);
    const oldStatus = room.status;
    store.updateRoom(roomNumber, {
      status: 'cleaning_required',
      occupiedBy: null,
      occupiedAt: null,
      dirtyAt: Date.now(),
      lastCheckOutAt: Date.now(),
      lastGuestName: guest.name, // tarix uchun saqlaymiz
    });

    store.incrementStat('totalCheckOuts');
    store.incrementStat('totalRevenue', bill.total);

    broker.publish('guest.checked_out', { guest, room: { number: roomNumber }, bill });
    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'cleaning_required',
      changedBy: 'reception',
      reason: 'check_out',
    });
    broker.publish('notification.created', {
      type: 'cleaning_required',
      severity: 'warning',
      message: `${roomNumber}-xona bo'shadi va tozalanishi kerak (${guest.name} chiqdi)`,
      roomNumber,
    });

    logger.info(`[RECEPTION] Check-out: ${guest.name} (${roomNumber}) -> ${bill.total.toLocaleString()} UZS, xona tozalash kerak`);

    return { success: true, bill };
  }

  /**
   * "Tekshiruvda" turgan xonani "Bo'sh va tayyor" deb tasdiqlash.
   * Qabul xodimi tozalanganini ko'rib tasdiqlaganidan keyin yangi mehmonlar uchun ochiladi.
   */
  confirmAvailable(roomNumber) {
    const room = store.getRoom(roomNumber);
    if (!room) {
      return { success: false, error: `${roomNumber}-xona topilmadi` };
    }
    if (room.status !== 'inspection') {
      return {
        success: false,
        error: `${roomNumber}-xona tekshiruvda emas (joriy: ${room.status}). Avval tozalovchi yakunlashi kerak.`,
      };
    }

    const oldStatus = room.status;
    store.updateRoom(roomNumber, {
      status: 'available',
      inspectionStartedAt: null,
      availableSince: Date.now(),
    });

    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'available',
      changedBy: 'reception',
      reason: 'inspection_confirmed',
    });
    broker.publish('notification.created', {
      type: 'room_available',
      severity: 'success',
      message: `${roomNumber}-xona tekshirildi va yangi mehmonlar uchun tayyor`,
      roomNumber,
    });

    logger.info(`[RECEPTION] ${roomNumber}-xona tasdiqlandi: AVAILABLE`);
    return { success: true, room: store.getRoom(roomNumber) };
  }

  /**
   * Manual ravishda xonani "Tozalash kerak" deb belgilash.
   * Foydalanish holati: mehmon chiqarmasdan, lekin xona iflos bo'lib qolgan.
   */
  markNeedsCleaning(roomNumber, reason = 'manual') {
    const room = store.getRoom(roomNumber);
    if (!room) {
      return { success: false, error: `${roomNumber}-xona topilmadi` };
    }
    if (room.status === 'occupied') {
      return { success: false, error: `${roomNumber}-xona band — avval mehmon chiqishi kerak` };
    }
    if (room.status === 'cleaning_required' || room.status === 'cleaning') {
      return { success: false, error: `${roomNumber}-xona allaqachon tozalanmoqda yoki navbatda` };
    }
    if (room.status === 'maintenance') {
      return { success: false, error: `${roomNumber}-xona texnik xizmatda` };
    }

    const oldStatus = room.status;
    store.updateRoom(roomNumber, {
      status: 'cleaning_required',
      dirtyAt: Date.now(),
    });

    broker.publish('room.status_changed', {
      roomNumber,
      oldStatus,
      newStatus: 'cleaning_required',
      changedBy: 'reception',
      reason,
    });
    broker.publish('notification.created', {
      type: 'cleaning_required',
      severity: 'warning',
      message: `${roomNumber}-xona tozalash kerakligi qo'lda belgilandi`,
      roomNumber,
    });

    logger.info(`[RECEPTION] ${roomNumber}-xona qo'lda tozalash kerakligi belgilandi`);
    return { success: true, room: store.getRoom(roomNumber) };
  }

  /** Inventar so'rovi — barcha xonalar holati */
  getInventory() {
    const rooms = store.getRooms();
    const summary = {
      total: rooms.length,
      available: 0,
      occupied: 0,
      cleaning_required: 0,
      cleaning: 0,
      inspection: 0,
      maintenance: 0,
    };
    for (const r of rooms) summary[r.status] = (summary[r.status] || 0) + 1;
    return { rooms, summary };
  }
}

module.exports = new ReceptionService();
