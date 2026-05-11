/**
 * priorityQueue.js
 * --------------------------------------------------------------------------
 * Ustuvorlik navbati ma'lumotlar tuzilmasi. Texnik xizmat so'rovlarini
 * shoshilinchlik darajasi bo'yicha reytinglaydi. Bir xil darajadagi
 * so'rovlar uchun avval topshirilgan ustun keladi (FIFO tie-breaker).
 *
 * Bu klassik binary heap emas, lekin namoyish maqsadi uchun yetarli va
 * o'qilishi oson. Insertion O(n log n) — bizning miqyosimizda muhim emas.
 * --------------------------------------------------------------------------
 */

'use strict';

const URGENCY_RANK = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

class PriorityQueue {
  constructor() {
    this.items = []; // har bir element: { value, priority, submittedAt }
  }

  /** Element qo'shadi va navbatni qayta tartiblaydi */
  enqueue(value, urgency = 'normal', submittedAt = Date.now()) {
    const priority = URGENCY_RANK[urgency] ?? URGENCY_RANK.normal;
    this.items.push({ value, priority, urgency, submittedAt });
    this._sort();
    return value;
  }

  /** Eng yuqori ustunlikdagi elementni olib tashlaydi va qaytaradi */
  dequeue() {
    if (this.items.length === 0) return null;
    return this.items.shift().value;
  }

  /** Eng yuqori ustunlikdagi elementni qaytaradi, lekin o'chirmaydi */
  peek() {
    return this.items[0]?.value ?? null;
  }

  /** Element o'chirish (id orqali) */
  remove(predicate) {
    const idx = this.items.findIndex((it) => predicate(it.value));
    if (idx === -1) return null;
    const [removed] = this.items.splice(idx, 1);
    return removed.value;
  }

  /** Navbatdagi barcha elementlarni tartiblangan holda qaytaradi */
  toArray() {
    return this.items.map((it) => it.value);
  }

  size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Tartiblash: yuqori ustunlik birinchi, bir xil darajada — eski birinchi.
   * Stable sort ishlatiladi.
   */
  _sort() {
    this.items.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.submittedAt - b.submittedAt;
    });
  }
}

module.exports = { PriorityQueue, URGENCY_RANK };
