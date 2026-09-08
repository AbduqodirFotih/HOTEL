import time
import secrets
from app.broker.message_broker import broker
from app.data.store import store
from app.utils.logger import logger
from app.algorithms.room_assignment import assign_room
from app.algorithms.billing import calculate_bill

def gen_id(prefix):
    return f"{prefix}_{int(time.time() * 1000)}_{secrets.token_hex(3)}"

class ReceptionService:
    def __init__(self):
        self.name = 'reception'
        logger.info("[RECEPTION] Servis ishga tushdi")

    def check_in(self, criteria):
        rooms = store.get_rooms()
        assignment = assign_room(rooms, criteria)
        room = assignment.get("room")
        reason = assignment.get("reason")

        if not room:
            logger.warn(f"[RECEPTION] Check-in muvaffaqiyatsiz: {reason}")
            return {"success": False, "error": reason}

        guest = {
            "id": gen_id('guest'),
            "name": criteria.get('guestName'),
            "roomNumber": room['number'],
            "checkInAt": int(time.time() * 1000),
            "nights": criteria.get('nights'),
            "paymentMethod": criteria.get('paymentMethod', 'card'),
            "preferences": {
                "floor": criteria.get('floorPreference'),
                "proximity": criteria.get('proximityPreference'),
            },
            "extraCharges": [],
        }

        store.add_guest(guest)

        old_status = room['status']
        store.update_room(room['number'], {
            "status": 'occupied',
            "occupiedBy": guest['id'],
            "occupiedAt": int(time.time() * 1000),
        })

        store.increment_stat('totalCheckIns')

        broker.publish('guest.checked_in', {
            "guest": guest,
            "room": {"number": room['number'], "type": room['type'], "floor": room['floor']},
            "assignmentReason": reason,
            "actor": 'reception',
        })

        broker.publish('room.status_changed', {
            "roomNumber": room['number'],
            "oldStatus": old_status,
            "newStatus": 'occupied',
            "changedBy": 'reception',
        })

        logger.info(f"[RECEPTION] Check-in: {guest['name']} -> {room['number']}-xona ({reason})")

        return {
            "success": True,
            "guest": guest,
            "room": store.get_room(room['number']),
            "assignmentReason": reason,
        }

    def check_out(self, room_number, params=None):
        if params is None:
            params = {}
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}
        
        if room.get('status') != 'occupied':
            return {"success": False, "error": f"{room_number}-xona band emas (joriy holati: {room.get('status')})"}

        guests = store.get_guests()
        guest = next((g for g in guests if g.get('roomNumber') == room_number), None)
        
        if not guest:
            return {"success": False, "error": f"{room_number}-xonada mehmon yozuvi yo'q"}

        extra_charges = params.get('extraCharges', [])
        discount = params.get('discount')

        all_extras = guest.get('extraCharges', []) + extra_charges

        bill = calculate_bill({
            "guest": guest,
            "room": room,
            "orders": store.get_orders(),
            "extraCharges": all_extras,
            "discount": discount,
            "checkOutAt": int(time.time() * 1000)
        })

        store.remove_guest(guest['id'])
        old_status = room['status']
        store.update_room(room_number, {
            "status": 'cleaning_required',
            "occupiedBy": None,
            "occupiedAt": None,
            "dirtyAt": int(time.time() * 1000),
            "lastCheckOutAt": int(time.time() * 1000),
            "lastGuestName": guest['name'],
        })

        store.increment_stat('totalCheckOuts')
        store.increment_stat('totalRevenue', bill['total'])

        broker.publish('guest.checked_out', {"guest": guest, "room": {"number": room_number}, "bill": bill})
        broker.publish('room.status_changed', {
            "roomNumber": room_number,
            "oldStatus": old_status,
            "newStatus": 'cleaning_required',
            "changedBy": 'reception',
            "reason": 'check_out',
        })
        broker.publish('notification.created', {
            "type": 'cleaning_required',
            "severity": 'warning',
            "message": f"{room_number}-xona bo'shadi va tozalanishi kerak ({guest['name']} chiqdi)",
            "roomNumber": room_number,
        })

        logger.info(f"[RECEPTION] Check-out: {guest['name']} ({room_number}) -> {bill['total']} UZS, xona tozalash kerak")

        return {"success": True, "bill": bill}

    def confirm_available(self, room_number):
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}
        
        if room.get('status') != 'inspection':
            return {
                "success": False,
                "error": f"{room_number}-xona tekshiruvda emas (joriy: {room.get('status')}). Avval tozalovchi yakunlashi kerak."
            }

        old_status = room['status']
        store.update_room(room_number, {
            "status": 'available',
            "inspectionStartedAt": None,
            "availableSince": int(time.time() * 1000),
        })

        broker.publish('room.status_changed', {
            "roomNumber": room_number,
            "oldStatus": old_status,
            "newStatus": 'available',
            "changedBy": 'reception',
            "reason": 'inspection_confirmed',
        })
        broker.publish('notification.created', {
            "type": 'room_available',
            "severity": 'success',
            "message": f"{room_number}-xona tekshirildi va yangi mehmonlar uchun tayyor",
            "roomNumber": room_number,
        })

        logger.info(f"[RECEPTION] {room_number}-xona tasdiqlandi: AVAILABLE")
        return {"success": True, "room": store.get_room(room_number)}

    def mark_needs_cleaning(self, room_number, reason='manual'):
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}
            
        if room.get('status') == 'occupied':
            return {"success": False, "error": f"{room_number}-xona band — avval mehmon chiqishi kerak"}
            
        if room.get('status') in ('cleaning_required', 'cleaning'):
            return {"success": False, "error": f"{room_number}-xona allaqachon tozalanmoqda yoki navbatda"}
            
        if room.get('status') == 'maintenance':
            return {"success": False, "error": f"{room_number}-xona texnik xizmatda"}

        old_status = room['status']
        store.update_room(room_number, {
            "status": 'cleaning_required',
            "dirtyAt": int(time.time() * 1000),
        })

        broker.publish('room.status_changed', {
            "roomNumber": room_number,
            "oldStatus": old_status,
            "newStatus": 'cleaning_required',
            "changedBy": 'reception',
            "reason": reason,
        })
        broker.publish('notification.created', {
            "type": 'cleaning_required',
            "severity": 'warning',
            "message": f"{room_number}-xona tozalash kerakligi qo'lda belgilandi",
            "roomNumber": room_number,
        })

        logger.info(f"[RECEPTION] {room_number}-xona qo'lda tozalash kerakligi belgilandi")
        return {"success": True, "room": store.get_room(room_number)}

    def get_inventory(self):
        rooms = store.get_rooms()
        summary = {
            "total": len(rooms),
            "available": 0,
            "occupied": 0,
            "cleaning_required": 0,
            "cleaning": 0,
            "inspection": 0,
            "maintenance": 0,
        }
        for r in rooms:
            st = r.get('status')
            if st in summary:
                summary[st] += 1
            else:
                summary[st] = 1
        return {"rooms": rooms, "summary": summary}

reception_service = ReceptionService()
