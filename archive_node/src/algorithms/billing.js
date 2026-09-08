/**
 * billing.js
 * --------------------------------------------------------------------------
 * Hisob-kitob algoritmi. Check-out paytida umumiy hisobni hisoblaydi:
 *   - Xona narxi × tunlar soni (erta check-out hisobga olinadi)
 *   - Xona xizmati to'lovlari (yetkazilgan buyurtmalar)
 *   - Qo'shimcha to'lovlar (minibar, kech check-out va h.k.)
 *   - Chegirma (foiz yoki qattiq summa)
 *
 * Chegaraviy holatlar:
 *   - Erta check-out: faqat haqiqatan turilgan tunlar uchun hisoblanadi
 *   - Nol to'lovlar: 0 ham haqiqiy chiqish — xato emas
 *   - Yetkazilmagan buyurtmalar hisobga olinmaydi
 * --------------------------------------------------------------------------
 */

'use strict';

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function calculateBill({ guest, room, orders = [], extraCharges = [], discount = null, checkOutAt = Date.now() }) {
  if (!guest || !room) {
    throw new Error('calculateBill: mehmon va xona talab qilinadi');
  }

  // 1. Haqiqiy tunlar sonini hisoblaymiz (erta check-out e'tiborga olinadi)
  const elapsedMs = Math.max(0, checkOutAt - guest.checkInAt);
  const actualNights = Math.max(1, Math.ceil(elapsedMs / ONE_DAY_MS));
  const billedNights = Math.min(actualNights, guest.nights);

  const roomCharge = room.nightlyRate * billedNights;

  // 2. Faqat yetkazilgan buyurtmalarning to'lovlarini qo'shamiz
  const guestOrders = orders.filter(
    (o) => o.roomNumber === room.number && o.status === 'delivered'
  );
  const orderCharges = guestOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  // 3. Qo'shimcha to'lovlar (minibar, kech check-out, va h.k.)
  const extras = (extraCharges || []).reduce((sum, e) => sum + (e.amount || 0), 0);

  // 4. Subtotal
  let subtotal = roomCharge + orderCharges + extras;

  // 5. Chegirma qo'llaymiz (mavjud bo'lsa)
  let discountAmount = 0;
  if (discount) {
    if (discount.type === 'percent') {
      discountAmount = Math.round(subtotal * (discount.value / 100));
    } else if (discount.type === 'flat') {
      discountAmount = Math.min(discount.value, subtotal); // Manfiy bo'lmasligi kerak
    }
  }

  const total = Math.max(0, subtotal - discountAmount);

  return {
    roomNumber: room.number,
    guestName: guest.name,
    checkInAt: guest.checkInAt,
    checkOutAt,
    nights: billedNights,
    nightlyRate: room.nightlyRate,
    roomCharge,
    orders: guestOrders.map((o) => ({
      id: o.id,
      items: o.items,
      total: o.total,
      deliveredAt: o.deliveredAt,
    })),
    orderCharges,
    extraCharges: extras,
    extraChargeDetails: extraCharges,
    subtotal,
    discount: discount || null,
    discountAmount,
    total,
    currency: 'UZS',
  };
}

module.exports = { calculateBill };
