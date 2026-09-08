/**
 * roomAssignment.js
 * --------------------------------------------------------------------------
 * HotelOSning eng muhim algoritmi — mehmonga eng yaxshi mavjud xonani
 * tayinlash. Topshiriqdagi 5 mezonni qat'iy ketma-ketlikda qo'llaydi:
 *
 *  1) Xona turi mos kelishi (qat'iy filtr)
 *  2) Tozalik holati = 'clean' (qat'iy filtr)
 *  3) Eng uzoq toza (asosiy saralash)
 *  4) Qavat afzalligi (ikkinchi darajali filtr — bo'sh bo'lsa, e'tibor bermaymiz)
 *  5) Yaqinlik afzalligi (yakuniy hal qiluvchi)
 *
 * Kirish: rooms (xona ro'yxati), criteria (mehmon talablari)
 * Chiqish: { room, reason } yoki { room: null, reason: "..." }
 * --------------------------------------------------------------------------
 */

'use strict';

function assignRoom(rooms, criteria) {
  const { roomType, floorPreference = null, proximityPreference = 'none', roomNumber = null } = criteria;

  // 0-bosqich: Agar aniq xona raqami ko'rsatilgan bo'lsa (kartochkadan check-in)
  // — uni shu yerda hal qilamiz, algoritmni o'tkazib yuboramiz
  if (roomNumber != null) {
    const explicit = rooms.find((r) => r.number === roomNumber);
    if (!explicit) {
      return { room: null, reason: `${roomNumber}-xona topilmadi` };
    }
    if (explicit.status !== 'available') {
      return {
        room: null,
        reason: `${roomNumber}-xona hozir bo'sh emas (holati: ${explicit.status})`,
      };
    }
    return { room: explicit, reason: `Operator ${roomNumber}-xonani aniq tanladi` };
  }

  // 1-bosqich: Xona turi va holati bo'yicha qat'iy filtr
  // Faqat 'available' (bo'sh va tayyor) xonalar nomzod bo'la oladi
  let candidates = rooms.filter(
    (r) => r.type === roomType && r.status === 'available'
  );

  if (candidates.length === 0) {
    // Hech qanday mos xona yo'q — sababini aniqlaymiz
    const sameType = rooms.filter((r) => r.type === roomType);
    if (sameType.length === 0) {
      return {
        room: null,
        reason: `So'ralgan turdagi xonalar (${roomType}) mehmonxonada mavjud emas`,
      };
    }
    return {
      room: null,
      reason: `Barcha ${roomType} xonalar band yoki hozircha tayyor emas. Iltimos, muqobil turni tanlang yoki kutish ro'yxatiga qo'shing.`,
    };
  }

  // 2-bosqich: Qavat afzalligini qo'llash (agar bildirilgan bo'lsa)
  if (floorPreference != null) {
    const sameFloor = candidates.filter((r) => r.floor === floorPreference);
    if (sameFloor.length > 0) {
      candidates = sameFloor;
    }
    // Aks holda istalgan qavatga o'tamiz (kandidatlar o'zgarmaydi)
  }

  // 3-bosqich: Eng uzoq toza bo'lgan xonalarni birinchi joyga qo'yamiz
  // (lastCleanedAt qiymati eng kichik bo'lganlar — eng uzoq toza turganlar)
  candidates.sort((a, b) => (a.lastCleanedAt || 0) - (b.lastCleanedAt || 0));

  // 4-bosqich: Yaqinlik afzalligi — yakuniy hal qiluvchi
  if (proximityPreference === 'near_elevator') {
    const near = candidates.filter((r) => r.nearElevator);
    if (near.length > 0) candidates = near;
  } else if (proximityPreference === 'near_stairs') {
    const near = candidates.filter((r) => r.nearStairs);
    if (near.length > 0) candidates = near;
  }

  // Birinchi nomzodni tanlaymiz (eng uzoq toza + afzalliklarga mos)
  const selected = candidates[0];

  return {
    room: selected,
    reason: buildReason(selected, criteria),
  };
}

function buildReason(room, criteria) {
  const parts = [`${room.type} turidagi mos xona topildi`];
  if (criteria.floorPreference != null) {
    if (room.floor === criteria.floorPreference) {
      parts.push(`${criteria.floorPreference}-qavatdagi xona`);
    } else {
      parts.push(`${criteria.floorPreference}-qavatda mavjud emas, ${room.floor}-qavat tanlandi`);
    }
  }
  if (criteria.proximityPreference === 'near_elevator' && room.nearElevator) {
    parts.push('liftga yaqin');
  }
  if (criteria.proximityPreference === 'near_stairs' && room.nearStairs) {
    parts.push('zinapoyaga yaqin');
  }
  return parts.join(' · ');
}

module.exports = { assignRoom };
