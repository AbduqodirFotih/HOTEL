/**
 * messageBroker.js
 * ----------------------------------------------------------------------------
 * Soddalashtirilgan, lekin haqiqiy ishlaydigan xabar brokeri (publish/subscribe).
 * Servislar bir-birini to'g'ridan-to'g'ri chaqirmaydi — barchasi broker orqali
 * hodisalar nashr etadi va obuna bo'ladi. Bu mikroservislar arxitekturasining
 * asosiy tamoyilini (loose coupling) namoyish etadi.
 *
 * Mavzular (topics):
 *   guest.checked_in            -> Qabul -> (Panel)
 *   guest.checked_out           -> Qabul -> (Tozalash, Panel)
 *   room.status_changed         -> Tozalash/Qabul -> (Panel, Bildirishnoma)
 *   room.cleaning_required      -> Bildirishnoma -> (Tozalash, Panel)
 *   order.created               -> Xona -> (Panel)
 *   order.status_changed        -> Xona -> (Panel)
 *   maintenance.reported        -> Texnik Xizmat -> (Panel)
 *   maintenance.status_changed  -> Texnik Xizmat -> (Panel)
 *   notification.created        -> har qanday servis -> (Panel)
 * ----------------------------------------------------------------------------
 */

'use strict';

const logger = require('../utils/logger');

class MessageBroker {
  constructor() {
    // Mavzu -> obunachilar (handler funksiyalari) xaritasi
    this.subscribers = new Map();
    // Tarixiy hodisalar jurnali (debug / panel uchun cheklangan oxirgi 200)
    this.eventLog = [];
    this.maxLogSize = 200;
  }

  /**
   * Mavzuga obuna bo'lish. Handler async bo'lishi mumkin.
   * @returns {Function} obunani bekor qilish funksiyasi
   */
  subscribe(topic, handler) {
    if (typeof handler !== 'function') {
      throw new Error('subscribe: handler funksiya bo\'lishi kerak');
    }
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic).add(handler);
    logger.debug(`[BROKER] Obuna qo'shildi: ${topic}`);
    return () => this.subscribers.get(topic)?.delete(handler);
  }

  /**
   * Xabarni nashr etish. Barcha obunachilar chaqiriladi (parallel).
   * Bitta handler xatosi boshqalariga ta'sir qilmaydi.
   */
  publish(topic, payload = {}) {
    const event = {
      id: this._nextId(),
      topic,
      payload,
      publishedAt: new Date().toISOString(),
    };

    this._appendLog(event);
    logger.info(`[BROKER] ${topic}`, payload);

    const handlers = this.subscribers.get(topic);
    if (!handlers || handlers.size === 0) {
      return event;
    }

    // Mustaqil chaqirish — bittasining ishdan chiqishi boshqalariga ta'sir qilmaydi
    for (const handler of handlers) {
      Promise.resolve()
        .then(() => handler(event))
        .catch((err) => {
          logger.error(`[BROKER] Handler xatosi (${topic}):`, err.message);
        });
    }
    return event;
  }

  /** Oxirgi hodisalarni qaytaradi (panel uchun) */
  getRecentEvents(limit = 50) {
    return this.eventLog.slice(-limit).reverse();
  }

  /** Ro'yxatdagi barcha mavzular */
  listTopics() {
    return Array.from(this.subscribers.keys());
  }

  _appendLog(event) {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }
  }

  _nextId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Yagona broker instansiyasi (singleton) — barcha servislar shu obyektni baham ko'radi
const broker = new MessageBroker();

module.exports = broker;
