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
      // Hozir tozalanmayotgan, navbatda turmagan va texnik xizmatda bo'lmagan xonalar
      if (room.status === 'cleaning' || room.status === 'maintenance' || room.status === 'cleaning_required' || room.status === 'inspection') {
        continue;
      }
      // Oxirgi tozalanish vaqtidan beri o'tgan vaqt
      const elapsed = now - (room.lastCleanedAt || 0);
      if (elapsed < thresholdMs) continue;

      // Bildirishnoma takrorlanmasligi uchun
      if (room.cleaningReminderSentAt && (now - room.cleaningReminderSentAt) < thresholdMs) {
        continue;
      }
      store.updateRoom(room.number, { cleaningReminderSentAt: now });

      // BAND xonalar uchun: faqat eslatma yuboramiz — mehmon ichida bo'lganda
      // statusni o'zgartirib bo'lmaydi. Tozalovchi mehmon bilan kelishadi.
      if (room.status === 'occupied') {
        broker.publish('notification.created', {
          type: 'occupied_room_cleaning_due',
          severity: 'warning',
          targetRole: 'housekeeping',
          message: `🛎 ${room.number}-xona (BAND) ${Math.round(elapsed / ONE_HOUR)} soatdan beri tozalanmagan. Mehmon bilan kelishib tozalang.`,
          roomNumber: room.number,
        });
        triggered++;
        continue;
      }

      // BO'SH xonalar uchun: yangi mehmon kelishidan oldin tozalash kerak
      // (statusni cleaning_required ga olib o'tamiz)
      broker.publish('room.cleaning_required', {
        roomNumber: room.number,
        elapsedHours: Math.round(elapsed / ONE_HOUR),
        thresholdHours: settings.cleaningThresholdHours,
      });

      broker.publish('notification.created', {
        type: 'cleaning_reminder',
        severity: 'warning',
        targetRole: 'housekeeping',
        message: `🧹 ${room.number}-xona ${Math.round(elapsed / ONE_HOUR)} soatdan beri tozalanmagan. Yangi mehmonlardan oldin tozalash kerak.`,
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
