/**
 * store.js
 * --------------------------------------------------------------------------
 * Markaziy ma'lumotlar saqlash moduli. Ma'lumotlarni xotirada saqlaydi
 * va JSON faylga davriy ravishda yozadi (data.json). Bu real ma'lumotlar
 * bazasi emas, lekin namoyish maqsadida tizimni qayta ishga tushirish
 * davomida holatni saqlash imkonini beradi.
 *
 * Ma'lumotlar tuzilmalari (topshiriq talabiga muvofiq):
 *   - Array: xona inventari (rooms)
 *   - Priority Queue: texnik xizmat so'rovlari (alohida modulda)
 *   - Queue: xona xizmati buyurtmalari (orders, FIFO)
 *   - Map (Dict): mehmon yozuvlari (guests, kalit: id)
 * --------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const seed = require('./seedData');

const DATA_FILE = path.join(__dirname, '..', '..', 'data.json');
const SAVE_DEBOUNCE_MS = 1000;

class Store {
  constructor() {
    this.state = null;
    this._saveTimer = null;
    this._load();
  }

  _load() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.state = JSON.parse(raw);
        this._ensureFields();
        this._migrateStatuses(); // Eski versiyalardagi status nomlarini yangilaymiz
        logger.info(`[STORE] data.json dan yuklandi (${this.state.rooms.length} xona)`);
        return;
      } catch (err) {
        logger.error('[STORE] data.json o\'qishda xato, urug\'lik ma\'lumotlardan boshlaymiz:', err.message);
      }
    }
    this._seed();
  }

  /**
   * Eski status nomlarini yangilarga ko'chiramiz. Bu shunda kerakki, agar
   * foydalanuvchida oldingi versiyaning data.json fayli bo'lsa, dastur
   * to'g'ri ishlasin.
   */
  _migrateStatuses() {
    const map = {
      'clean': 'available',
      'dirty': 'cleaning_required',
    };
    let migrated = 0;
    for (const room of this.state.rooms) {
      if (map[room.status]) {
        room.status = map[room.status];
        migrated++;
      }
    }
    if (migrated > 0) {
      logger.info(`[STORE] Eski statuslardan ${migrated} ta xona ko'chirildi`);
      this.scheduleSave();
    }
  }

  _seed() {
    this.state = {
      rooms: JSON.parse(JSON.stringify(seed.rooms)),
      menu: JSON.parse(JSON.stringify(seed.menu)),
      technicians: JSON.parse(JSON.stringify(seed.technicians)),
      housekeepers: JSON.parse(JSON.stringify(seed.housekeepers)),
      guests: JSON.parse(JSON.stringify(seed.guests)),
      orders: JSON.parse(JSON.stringify(seed.orders)),
      maintenanceRequests: JSON.parse(JSON.stringify(seed.maintenanceRequests)),
      notifications: JSON.parse(JSON.stringify(seed.notifications)),
      settings: {
        cleaningThresholdHours: 12, // har 12 soatda tozalash kerak
        autoNotifyHousekeeping: true,
        notificationSound: true,
        language: 'uz',
        theme: 'light',
        density: 'comfortable',
        currency: 'UZS',
        autoRefreshSec: 5,
        dashboardShowEvents: true,
        showRoomTimers: true,
      },
      stats: {
        totalCheckIns: 0,
        totalCheckOuts: 0,
        totalRevenue: 0,
        totalOrders: 0,
        totalMaintenance: 0,
      },
    };
    this._save();
    logger.info('[STORE] Urug\'lik ma\'lumotlardan boshlandi');
  }

  _ensureFields() {
    const defaults = {
      rooms: [], menu: [], technicians: [], housekeepers: [],
      guests: [], orders: [], maintenanceRequests: [], notifications: [],
      settings: {
        cleaningThresholdHours: 12,
        autoNotifyHousekeeping: true,
        notificationSound: true,
        language: 'uz',
        theme: 'light',
        density: 'comfortable',
        currency: 'UZS',
        autoRefreshSec: 5,
        dashboardShowEvents: true,
        showRoomTimers: true,
      },
      stats: { totalCheckIns: 0, totalCheckOuts: 0, totalRevenue: 0, totalOrders: 0, totalMaintenance: 0 },
    };
    for (const k of Object.keys(defaults)) {
      if (this.state[k] == null) this.state[k] = defaults[k];
    }
  }

  /** Fayl yozishni 1 sekund kechiktiradi (batch) */
  scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), SAVE_DEBOUNCE_MS);
  }

  _save() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      logger.error('[STORE] data.json yozishda xato:', err.message);
    }
  }

  /** Barcha ma'lumotlarni urug'lik holatiga qaytarish (sozlamalar > "Reset") */
  reset() {
    this._seed();
  }

  // ---- Xona operatsiyalari (massiv) ----
  getRooms() { return this.state.rooms; }
  getRoom(number) { return this.state.rooms.find((r) => r.number === Number(number)); }
  updateRoom(number, patch) {
    const room = this.getRoom(number);
    if (!room) return null;
    Object.assign(room, patch);
    this.scheduleSave();
    return room;
  }

  // ---- Mehmon operatsiyalari (Map / Dict) ----
  getGuests() { return this.state.guests; }
  getGuest(id) { return this.state.guests.find((g) => g.id === id); }
  addGuest(guest) { this.state.guests.push(guest); this.scheduleSave(); return guest; }
  removeGuest(id) {
    const idx = this.state.guests.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    const [removed] = this.state.guests.splice(idx, 1);
    this.scheduleSave();
    return removed;
  }

  // ---- Buyurtmalar (Queue / FIFO) ----
  getOrders() { return this.state.orders; }
  addOrder(order) { this.state.orders.push(order); this.state.stats.totalOrders++; this.scheduleSave(); return order; }
  updateOrder(id, patch) {
    const o = this.state.orders.find((x) => x.id === id);
    if (!o) return null;
    Object.assign(o, patch);
    this.scheduleSave();
    return o;
  }

  // ---- Texnik xizmat so'rovlari ----
  getMaintenance() { return this.state.maintenanceRequests; }
  addMaintenance(req) {
    this.state.maintenanceRequests.push(req);
    this.state.stats.totalMaintenance++;
    this.scheduleSave();
    return req;
  }
  updateMaintenance(id, patch) {
    const r = this.state.maintenanceRequests.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    this.scheduleSave();
    return r;
  }

  // ---- Bildirishnomalar ----
  getNotifications(limit = 50) {
    return this.state.notifications.slice(-limit).reverse();
  }
  addNotification(notif) {
    this.state.notifications.push(notif);
    // Eng yangi 200 ta bildirishnomani saqlaymiz
    if (this.state.notifications.length > 200) {
      this.state.notifications = this.state.notifications.slice(-200);
    }
    this.scheduleSave();
    return notif;
  }
  markNotificationRead(id) {
    const n = this.state.notifications.find((x) => x.id === id);
    if (n) { n.read = true; this.scheduleSave(); }
    return n;
  }
  clearReadNotifications() {
    this.state.notifications = this.state.notifications.filter((n) => !n.read);
    this.scheduleSave();
  }

  // ---- Menyu / xodimlar ----
  getMenu() { return this.state.menu; }
  getMenuItem(id) { return this.state.menu.find((m) => m.id === id); }
  getTechnicians() { return this.state.technicians; }
  getHousekeepers() { return this.state.housekeepers; }

  // ---- Sozlamalar ----
  getSettings() { return this.state.settings; }
  updateSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.scheduleSave();
    return this.state.settings;
  }

  // ---- Statistika ----
  getStats() { return this.state.stats; }
  incrementStat(key, by = 1) {
    if (this.state.stats[key] != null) {
      this.state.stats[key] += by;
      this.scheduleSave();
    }
  }
}

module.exports = new Store();
