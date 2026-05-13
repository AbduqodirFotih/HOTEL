/**
 * roomService.js
 * --------------------------------------------------------------------------
 * Xona Servisi (Room Service). Ovqat va ichimlik buyurtmalarini boshqaradi.
 *
 * Buyurtma holatlari: received -> preparing -> delivering -> delivered
 * Har bir holat o'zgarishi brokerga nashr etiladi.
 *
 * Ma'lumotlar tuzilmasi: Queue (FIFO) — buyurtmalar tartibi muhim.
 * --------------------------------------------------------------------------
 */

'use strict';

const crypto = require('crypto');
const broker = require('../broker/messageBroker');
const store = require('../data/store');
const logger = require('../utils/logger');

const ORDER_FLOW = ['received', 'preparing', 'delivering', 'delivered'];

function genId() {
  return `order_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

class RoomServiceService {
  constructor() {
    this.name = 'roomservice';
    logger.info('[ROOMSERVICE] Servis ishga tushdi');
  }

  /** Yangi buyurtma yaratish */
  createOrder({ roomNumber, items }) {
    const room = store.getRoom(roomNumber);
    if (!room) {
      return { success: false, error: `${roomNumber}-xona topilmadi` };
    }
    if (room.status !== 'occupied') {
      return { success: false, error: `${roomNumber}-xona band emas — buyurtma qabul qilinmaydi` };
    }

    // Mahsulotlarni menyu bilan tekshiramiz va narxlarni hisoblaymiz
    const enriched = [];
    let total = 0;
    for (const item of items) {
      const menuItem = store.getMenuItem(item.itemId);
      if (!menuItem) {
        return { success: false, error: `Menyuda topilmadi: ${item.itemId}` };
      }
      const lineTotal = menuItem.price * item.quantity;
      enriched.push({
        itemId: menuItem.id,
        name: menuItem.name,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        lineTotal,
      });
      total += lineTotal;
    }

    const order = {
      id: genId(),
      roomNumber,
      items: enriched,
      total,
      status: 'received',
      createdAt: Date.now(),
      statusHistory: [{ status: 'received', at: Date.now() }],
    };

    store.addOrder(order);

    broker.publish('order.created', { order });
    broker.publish('order.status_changed', { order, oldStatus: null, newStatus: 'received' });
    broker.publish('notification.created', {
      type: 'order_received',
      severity: 'info',
      message: `Yangi buyurtma: ${roomNumber}-xona, jami ${total.toLocaleString()} UZS`,
      roomNumber,
      orderId: order.id,
    });

    logger.info(`[ROOMSERVICE] Buyurtma yaratildi: ${order.id} (${roomNumber}-xona)`);
    return { success: true, order };
  }

  /** Buyurtma holatini keyingi bosqichga o'tkazish */
  advanceOrder(orderId) {
    const order = store.getOrders().find((o) => o.id === orderId);
    if (!order) return { success: false, error: 'Buyurtma topilmadi' };

    const idx = ORDER_FLOW.indexOf(order.status);
    if (idx === -1 || idx === ORDER_FLOW.length - 1) {
      return { success: false, error: `Buyurtma allaqachon yakunlangan: ${order.status}` };
    }

    const oldStatus = order.status;
    const newStatus = ORDER_FLOW[idx + 1];
    const now = Date.now();

    const patch = {
      status: newStatus,
      statusHistory: [...order.statusHistory, { status: newStatus, at: now }],
    };
    if (newStatus === 'delivered') patch.deliveredAt = now;

    store.updateOrder(orderId, patch);
    const updated = store.getOrders().find((o) => o.id === orderId);

    broker.publish('order.status_changed', { order: updated, oldStatus, newStatus });
    broker.publish('notification.created', {
      type: 'order_status',
      severity: newStatus === 'delivered' ? 'success' : 'info',
      message: `${updated.roomNumber}-xona buyurtmasi: ${newStatus}`,
      roomNumber: updated.roomNumber,
      orderId,
    });

    logger.info(`[ROOMSERVICE] ${orderId}: ${oldStatus} -> ${newStatus}`);
    return { success: true, order: updated };
  }

  /** Buyurtmani bekor qilish */
  cancelOrder(orderId, reason = 'Mehmon iltimosi bo\'yicha') {
    const order = store.getOrders().find((o) => o.id === orderId);
    if (!order) return { success: false, error: 'Buyurtma topilmadi' };
    if (order.status === 'delivered') {
      return { success: false, error: 'Yetkazilgan buyurtmani bekor qilib bo\'lmaydi' };
    }
    const oldStatus = order.status;
    store.updateOrder(orderId, {
      status: 'cancelled',
      cancelledAt: Date.now(),
      cancellationReason: reason,
    });
    const updated = store.getOrders().find((o) => o.id === orderId);
    broker.publish('order.status_changed', { order: updated, oldStatus, newStatus: 'cancelled' });
    return { success: true, order: updated };
  }

  getActiveOrders() {
    return store.getOrders().filter((o) => !['delivered', 'cancelled'].includes(o.status));
  }
}

module.exports = new RoomServiceService();
