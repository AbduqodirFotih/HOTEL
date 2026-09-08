import time
from app.broker.message_broker import broker
from app.data.store import store
from app.utils.logger import logger

class HousekeepingService:
    def __init__(self):
        self.name = 'housekeeping'
        self.cleaning_queue = []
        self._subscribe()
        self._restore_queue_from_store()
        logger.info('[HOUSEKEEPING] Servis ishga tushdi')

    def _subscribe(self):
        def on_guest_checked_out(event):
            room = event.get('payload', {}).get('room', {})
            room_number = room.get('number')
            if room_number is not None:
                self._enqueue_without_status_change(room_number, 'guest_checkout')

        def on_room_cleaning_required(event):
            room_number = event.get('payload', {}).get('roomNumber')
            if room_number is not None:
                self._enqueue_without_status_change(room_number, 'periodic_check')

        broker.subscribe('guest.checked_out', on_guest_checked_out)
        broker.subscribe('room.cleaning_required', on_room_cleaning_required)

    def _restore_queue_from_store(self):
        for r in store.get_rooms():
            if r.get('status') == 'cleaning_required':
                self.cleaning_queue.append({
                    "roomNumber": r['number'],
                    "reason": 'restored',
                    "addedAt": r.get('dirtyAt', int(time.time() * 1000)),
                })

    def _enqueue_without_status_change(self, room_number, reason):
        room = store.get_room(room_number)
        if not room or room.get('status') != 'cleaning_required':
            return None
        if any(q.get('roomNumber') == room_number for q in self.cleaning_queue):
            return None

        entry = {"roomNumber": room_number, "reason": reason, "addedAt": int(time.time() * 1000)}
        self.cleaning_queue.append(entry)
        self._try_assign_cleaner(entry)
        return entry

    def add_to_cleaning_queue(self, room_number, reason='manual'):
        room = store.get_room(room_number)
        if not room:
            return None
        if room.get('status') == 'occupied':
            logger.warn(f"[HOUSEKEEPING] {room_number}-xona band, navbatga qo'shilmaydi")
            return None
        if room.get('status') in ('cleaning', 'maintenance'):
            return None
        if any(q.get('roomNumber') == room_number for q in self.cleaning_queue):
            return None

        if room.get('status') != 'cleaning_required' and reason == 'guest_checkout':
            logger.debug(f"[HOUSEKEEPING] {room_number} allaqachon {room.get('status')}, navbatga qo'shilmaydi")
            return None

        if room.get('status') != 'cleaning_required':
            old_status = room.get('status')
            store.update_room(room_number, {"status": 'cleaning_required', "dirtyAt": int(time.time() * 1000)})
            broker.publish('room.status_changed', {
                "roomNumber": room_number, "oldStatus": old_status, "newStatus": 'cleaning_required',
                "changedBy": 'housekeeping', "reason": reason,
            })

        entry = {"roomNumber": room_number, "reason": reason, "addedAt": int(time.time() * 1000)}
        self.cleaning_queue.append(entry)
        self._try_assign_cleaner(entry)
        return entry

    def _try_assign_cleaner(self, queue_entry):
        housekeepers = store.get_housekeepers()
        free = next((h for h in housekeepers if h.get('available')), None)
        if not free:
            return None
        queue_entry["assignedTo"] = free['id']
        queue_entry["assignedToName"] = free['name']
        queue_entry["assignedAt"] = int(time.time() * 1000)
        return free

    def start_cleaning(self, room_number, by_user='system'):
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}
        if room.get('status') != 'cleaning_required':
            return {"success": False, "error": f"{room_number}-xona tozalash uchun tayyor emas (joriy: {room.get('status')})"}
            
        old_status = room.get('status')
        store.update_room(room_number, {
            "status": 'cleaning',
            "cleaningStartedAt": int(time.time() * 1000),
            "cleanedBy": by_user,
        })
        
        broker.publish('room.status_changed', {
            "roomNumber": room_number, "oldStatus": old_status, "newStatus": 'cleaning',
            "changedBy": 'housekeeping', "actor": by_user,
        })
        logger.info(f"[HOUSEKEEPING] {room_number}-xona tozalanmoqda ({by_user})")
        return {"success": True, "room": store.get_room(room_number)}

    def mark_clean(self, room_number, by_user='system'):
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}
        if room.get('status') not in ('cleaning', 'cleaning_required'):
            return {"success": False, "error": f"{room_number}-xona tozalanmagan (joriy: {room.get('status')})"}
            
        old_status = room.get('status')
        now = int(time.time() * 1000)
        cleaning_duration_ms = now - room.get('cleaningStartedAt', now) if room.get('cleaningStartedAt') else None

        store.update_room(room_number, {
            "status": 'inspection',
            "lastCleanedAt": now,
            "inspectionStartedAt": now,
            "dirtyAt": None,
            "cleaningStartedAt": None,
            "lastCleaningDurationMs": cleaning_duration_ms,
            "lastCleanedBy": by_user,
        })

        self.cleaning_queue = [q for q in self.cleaning_queue if q.get('roomNumber') != room_number]

        store.increment_stat('totalCleanings')

        broker.publish('room.status_changed', {
            "roomNumber": room_number, "oldStatus": old_status, "newStatus": 'inspection',
            "changedBy": 'housekeeping', "actor": by_user,
        })
        broker.publish('notification.created', {
            "type": 'inspection_required',
            "severity": 'info',
            "message": f"{room_number}-xona tozalandi va qabul tomonidan tekshirilishi kutilmoqda",
            "roomNumber": room_number,
        })

        logger.info(f"[HOUSEKEEPING] {room_number}-xona tozalandi -> TEKSHIRUVDA")
        return {"success": True, "room": store.get_room(room_number)}

    def get_queue(self):
        res = []
        for q in self.cleaning_queue:
            item = dict(q)
            item["room"] = store.get_room(q["roomNumber"])
            res.append(item)
        return res

housekeeping_service = HousekeepingService()
