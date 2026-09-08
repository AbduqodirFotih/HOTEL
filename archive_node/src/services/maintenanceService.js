/**
 * maintenanceService.js
 * --------------------------------------------------------------------------
 * Texnik Xizmat Servisi.
 *
 * Status workflow (4 bosqich):
 *   open          : Yangi so'rov, hech kim ko'rmagan
 *   acknowledged  : Texnik so'rovni ko'rdi va qabul qildi
 *   in_progress   : Texnik xizmat ko'rsatmoqda
 *   resolved      : Hal qilindi
 *
 * Ustuvorlik darajalari: critical > high > normal > low
 * Bir xil darajada — avval topshirilgani ustun keladi (FIFO).
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

  _restoreQueue() {
    const open = store.getMaintenance().filter(
      (r) => r.status === 'open' || r.status === 'acknowledged' || r.status === 'in_progress'
    );
    for (const req of open) {
      this.queue.enqueue(req, req.urgency, req.submittedAt);
    }
  }

  /** Yangi texnik xizmat so'rovi — statusi 'open' (texnik ko'rmagan) */
  report({ roomNumber, description, urgency, category }, byUser = 'system') {
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
      submittedBy: byUser,
      assignedTo: null,
      assignedToName: null,
      acknowledgedAt: null,
      startedAt: null,
      resolvedAt: null,
      resolutionNotes: null,
    };

    store.addMaintenance(request);
    this.queue.enqueue(request, urgency, request.submittedAt);

    broker.publish('maintenance.reported', { request });
    broker.publish('notification.created', {
      type: 'maintenance_reported',
      severity: urgency === 'critical' ? 'critical' : urgency === 'high' ? 'warning' : 'info',
      message: `Yangi texnik so'rov: ${roomNumber}-xona — ${description} (${urgency})`,
      roomNumber,
      requestId: request.id,
    });

    logger.info(`[MAINTENANCE] Yangi so'rov: ${request.id} (${roomNumber}, ${urgency})`);
    return { success: true, request };
  }

  /** Texnik so'rovni ko'rdi va qabul qildi: open -> acknowledged */
  acknowledge(requestId, byUser = 'system') {
    const req = store.getMaintenance().find((r) => r.id === requestId);
    if (!req) return { success: false, error: 'So\'rov topilmadi' };
    if (req.status !== 'open') {
      return { success: false, error: `So'rov 'open' holatida emas (joriy: ${req.status})` };
    }

    // Tayinlangan texnikni topamiz
    const technicians = store.getTechnicians();
    const tech = technicians.find((t) => t.name === byUser || t.id === byUser)
              || technicians.find((t) => t.available)
              || { id: 'tech_unknown', name: byUser };

    store.updateMaintenance(requestId, {
      status: 'acknowledged',
      acknowledgedAt: Date.now(),
      assignedTo: tech.id,
      assignedToName: tech.name,
    });
    const updated = store.getMaintenance().find((r) => r.id === requestId);

    broker.publish('maintenance.status_changed', {
      request: updated, oldStatus: 'open', newStatus: 'acknowledged',
    });

    logger.info(`[MAINTENANCE] ${requestId} qabul qilindi (${tech.name})`);
    return { success: true, request: updated };
  }

  /** Texnik ishni boshladi: acknowledged -> in_progress */
  start(requestId, byUser = 'system') {
    const req = store.getMaintenance().find((r) => r.id === requestId);
    if (!req) return { success: false, error: 'So\'rov topilmadi' };
    if (req.status !== 'acknowledged' && req.status !== 'open') {
      return { success: false, error: `So'rovni boshlab bo'lmaydi (joriy: ${req.status})` };
    }

    // Agar 'open' bo'lsa, avval acknowledge qilamiz
    if (req.status === 'open') {
      this.acknowledge(requestId, byUser);
    }

    const oldStatus = store.getMaintenance().find((r) => r.id === requestId).status;
    store.updateMaintenance(requestId, {
      status: 'in_progress',
      startedAt: Date.now(),
    });
    const updated = store.getMaintenance().find((r) => r.id === requestId);

    broker.publish('maintenance.status_changed', {
      request: updated, oldStatus, newStatus: 'in_progress',
    });

    logger.info(`[MAINTENANCE] ${requestId} jarayonda (${byUser})`);
    return { success: true, request: updated };
  }

  /** So'rovni hal qilish: in_progress -> resolved */
  resolve(requestId, notes = '', byUser = 'system') {
    const req = store.getMaintenance().find((r) => r.id === requestId);
    if (!req) return { success: false, error: 'So\'rov topilmadi' };
    if (req.status === 'resolved') return { success: false, error: 'So\'rov allaqachon hal etilgan' };

    // Agar avvalgi bosqichlar bajarilmagan bo'lsa, ularni avtomatik to'ldiramiz
    const now = Date.now();
    const patch = {
      status: 'resolved',
      resolvedAt: now,
      resolutionNotes: notes,
      resolvedBy: byUser,
    };
    if (!req.acknowledgedAt) patch.acknowledgedAt = now;
    if (!req.startedAt) patch.startedAt = now;

    const oldStatus = req.status;
    store.updateMaintenance(requestId, patch);
    const updated = store.getMaintenance().find((r) => r.id === requestId);

    this.queue.remove((r) => r.id === requestId);

    // Statistika
    store.incrementStat('totalMaintenanceResolved');

    broker.publish('maintenance.status_changed', {
      request: updated, oldStatus, newStatus: 'resolved',
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

  /** Joriy ochiq navbat */
  getQueue() {
    return this.queue.toArray().filter((r) => r.status !== 'resolved');
  }

  /** Barcha so'rovlar */
  getAll() {
    return store.getMaintenance();
  }

  /** ID bo'yicha bitta so'rov */
  getById(id) {
    return store.getMaintenance().find((r) => r.id === id) || null;
  }
}

module.exports = new MaintenanceService();
