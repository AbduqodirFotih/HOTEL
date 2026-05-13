/**
 * maintenanceService.js
 * --------------------------------------------------------------------------
 * Texnik Xizmat Servisi. Vazifalar:
 *   - Texnik xizmat so'rovlarini qabul qilish
 *   - Ustuvorlik navbati (PriorityQueue) ga qo'shish
 *   - Keyingi bo'sh texnikka avtomatik tayinlash
 *   - Hal qilingan so'rovlarni yopish
 *
 * Shoshilinchlik darajalari (yuqori -> past):
 *   critical -> high -> normal -> low
 * Bir xil darajada — avval topshirilgan ustun keladi (FIFO tie-breaker).
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const broker = require('../broker/messageBroker');
const store = require('../data/store');
const logger = require('../utils/logger');
const { PriorityQueue } = require('../algorithms/priorityQueue');

function genId() {
  return `maint_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

class MaintenanceService {
  constructor() {
    this.name = 'maintenance';
    this.queue = new PriorityQueue();
    this._restoreQueue();
    logger.info('[MAINTENANCE] Servis ishga tushdi');
  }

  /** Servis qayta ishga tushganda saqlangan ochiq so'rovlarni navbatga qayta yuklaymiz */
  _restoreQueue() {
    const open = store.getMaintenance().filter((r) => r.status === 'open' || r.status === 'in_progress');
    for (const req of open) {
      this.queue.enqueue(req, req.urgency, req.submittedAt);
    }
  }

  /** Yangi texnik xizmat so'rovi */
  report({ roomNumber, description, urgency, category }) {
    const room = store.getRoom(roomNumber);
    if (!room) {
      return { success: false, error: `${roomNumber}-xona topilmadi` };
    }

    const request = {
      id: genId(),
      roomNumber,
      description,
      urgency,
      category,
      status: 'open',
      submittedAt: Date.now(),
      assignedTo: null,
      resolvedAt: null,
    };

    // Bo'sh texnik bormi?
    const technicians = store.getTechnicians();
    const available = technicians.find((t) => t.available);
    if (available) {
      request.assignedTo = available.id;
      request.assignedToName = available.name;
      request.assignedAt = Date.now();
      request.status = 'in_progress';
      // Hozircha texnikni "band" qilmaymiz (demo) — ko'p so'rov bilan ishlay oladi
    }

    store.addMaintenance(request);
    this.queue.enqueue(request, urgency, request.submittedAt);

    broker.publish('maintenance.reported', { request });
    broker.publish('notification.created', {
      type: 'maintenance_reported',
      severity: urgency === 'critical' ? 'critical' : urgency === 'high' ? 'warning' : 'info',
      message: `${roomNumber}-xona: ${description} (${urgency})`,
      roomNumber,
      requestId: request.id,
    });

    logger.info(`[MAINTENANCE] Yangi so'rov: ${request.id} (${roomNumber}, ${urgency})`);
    return { success: true, request };
  }

  /** Texnik xizmat so'rovini hal etish */
  resolve(requestId, notes = '') {
    const req = store.getMaintenance().find((r) => r.id === requestId);
    if (!req) return { success: false, error: 'So\'rov topilmadi' };
    if (req.status === 'resolved') return { success: false, error: 'So\'rov allaqachon hal etilgan' };

    const oldStatus = req.status;
    store.updateMaintenance(requestId, {
      status: 'resolved',
      resolvedAt: Date.now(),
      resolutionNotes: notes,
    });
    const updated = store.getMaintenance().find((r) => r.id === requestId);

    // Navbatdan olib tashlaymiz
    this.queue.remove((r) => r.id === requestId);

    broker.publish('maintenance.status_changed', {
      request: updated,
      oldStatus,
      newStatus: 'resolved',
    });
    broker.publish('notification.created', {
      type: 'maintenance_resolved',
      severity: 'success',
      message: `${updated.roomNumber}-xona: muammo hal etildi`,
      roomNumber: updated.roomNumber,
      requestId,
    });

    logger.info(`[MAINTENANCE] So'rov hal etildi: ${requestId}`);
    return { success: true, request: updated };
  }

  /** Joriy ochiq navbat (ustuvorlik tartibida) */
  getQueue() {
    return this.queue.toArray();
  }

  /** Barcha so'rovlar (tarix bilan) */
  getAll() {
    return store.getMaintenance();
  }
}

module.exports = new MaintenanceService();
