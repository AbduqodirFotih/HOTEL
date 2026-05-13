/**
 * notificationService.js
 * --------------------------------------------------------------------------
 * Bildirishnoma servisi. Ikki vazifa:
 *
 *   1) Davriy ravishda toza xonalarni tekshiradi. Agar oxirgi tozalanish
 *      vaqtidan beri "cleaningThresholdHours" (default: 12 soat) o'tgan
 *      bo'lsa, tozalovchi xodimga bildirishnoma yuboradi va xonani
 *      'iflos' (dirty) deb belgilash uchun 'room.cleaning_required'
 *      hodisasini brokerga nashr etadi.
 *
 *   2) Brokerdagi barcha 'notification.created' hodisalarni tinglaydi va
 *      ularni store ga yozadi (panel va telefon ovozli xabarnomasi uchun).
 *
 * Bu servis WebSocket orqali ham xabar yuboradi (wsServer.js qabul qiladi).
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const broker = require('../broker/messageBroker');
const store = require('../data/store');
const logger = require('../utils/logger');

const ONE_HOUR = 1000 * 60 * 60;

// Demo maqsadlarida tezroq tekshirish (1 daqiqada bir marta).
// Real ishlab chiqarishda har 5-10 daqiqada bir tekshirish yetarli.
const CHECK_INTERVAL_MS = 60 * 1000;

function genId() {
  return `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

class NotificationService {
  constructor() {
    this.name = 'notification';
    this._timer = null;
    this._subscribe();
    this.startPeriodicCheck();
    logger.info('[NOTIFICATION] Servis ishga tushdi');
  }

  _subscribe() {
    broker.subscribe('notification.created', (event) => {
      const settings = store.getSettings();
      const notif = {
        id: genId(),
        type: event.payload.type || 'info',
        severity: event.payload.severity || 'info',
        message: event.payload.message,
        roomNumber: event.payload.roomNumber ?? null,
        orderId: event.payload.orderId ?? null,
        requestId: event.payload.requestId ?? null,
        createdAt: Date.now(),
        read: false,
        soundEnabled: settings.notificationSound,
      };
      store.addNotification(notif);
    });
  }

  /** Davriy tekshiruvni boshlash */
  startPeriodicCheck() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.checkCleaningSchedule(), CHECK_INTERVAL_MS);
    // Birinchi tekshiruvni darhol ishga tushiramiz
    setTimeout(() => this.checkCleaningSchedule(), 5000);
  }

  /** Asosiy logika: har 12 soatda tozalash kerakligi xabarnomasi */
  checkCleaningSchedule() {
    const settings = store.getSettings();
    const thresholdMs = (settings.cleaningThresholdHours || 12) * ONE_HOUR;
    const now = Date.now();
    const rooms = store.getRooms();
    let triggered = 0;

    for (const room of rooms) {
      // Faqat band bo'lmagan va hozir tozalanmayotgan xonalar
      if (room.status === 'occupied' || room.status === 'cleaning' || room.status === 'maintenance') {
        continue;
      }
      // Oxirgi tozalanish vaqtidan beri o'tgan vaqt
      const elapsed = now - (room.lastCleanedAt || 0);
      if (elapsed < thresholdMs) continue;

      // Allaqachon iflos bo'lsa va navbatda bo'lsa, takror xabar yubormaymiz
      if (room.status === 'dirty' && room.cleaningReminderSentAt && (now - room.cleaningReminderSentAt) < thresholdMs) {
        continue;
      }

      // Sodir bo'ldi: 12 soat o'tdi, tozalash kerakligi haqida xabar
      store.updateRoom(room.number, { cleaningReminderSentAt: now });

      broker.publish('room.cleaning_required', {
        roomNumber: room.number,
        elapsedHours: Math.round(elapsed / ONE_HOUR),
        thresholdHours: settings.cleaningThresholdHours,
      });

      broker.publish('notification.created', {
        type: 'cleaning_reminder',
        severity: 'warning',
        message: `${room.number}-xona ${Math.round(elapsed / ONE_HOUR)} soatdan beri tozalanmagan. Tozalash kerak.`,
        roomNumber: room.number,
      });
      triggered++;
    }

    if (triggered > 0) {
      logger.info(`[NOTIFICATION] Tozalash bildirishnomasi yuborildi: ${triggered} xona`);
    }
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}

module.exports = new NotificationService();
