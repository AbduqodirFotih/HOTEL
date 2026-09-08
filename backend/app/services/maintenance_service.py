import time
import secrets
from app.broker.message_broker import broker
from app.data.store import store
from app.utils.logger import logger
from app.algorithms.priority_queue import PriorityQueue

def gen_id():
    return f"maint_{int(time.time() * 1000)}_{secrets.token_hex(3)}"

class MaintenanceService:
    def __init__(self):
        self.name = 'maintenance'
        self.queue = PriorityQueue()
        self._restore_queue()
        logger.info('[MAINTENANCE] Servis ishga tushdi')

    def _restore_queue(self):
        open_reqs = [r for r in store.get_maintenance() if r.get('status') in ('open', 'acknowledged', 'in_progress')]
        for req in open_reqs:
            self.queue.enqueue(req, req.get('urgency'), req.get('submittedAt'))

    def report(self, params, by_user='system'):
        room_number = params.get('roomNumber')
        description = params.get('description')
        urgency = params.get('urgency')
        category = params.get('category')
        
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}

        request = {
            "id": gen_id(),
            "roomNumber": room_number,
            "description": description,
            "urgency": urgency,
            "category": category,
            "status": 'open',
            "submittedAt": int(time.time() * 1000),
            "submittedBy": by_user,
            "assignedTo": None,
            "assignedToName": None,
            "acknowledgedAt": None,
            "startedAt": None,
            "resolvedAt": None,
            "resolutionNotes": None,
        }

        store.add_maintenance(request)
        self.queue.enqueue(request, urgency, request['submittedAt'])

        broker.publish('maintenance.reported', {"request": request})
        
        severity = 'critical' if urgency == 'critical' else ('warning' if urgency == 'high' else 'info')
        broker.publish('notification.created', {
            "type": 'maintenance_reported',
            "severity": severity,
            "message": f"Yangi texnik so'rov: {room_number}-xona — {description} ({urgency})",
            "roomNumber": room_number,
            "requestId": request['id'],
        })

        logger.info(f"[MAINTENANCE] Yangi so'rov: {request['id']} ({room_number}, {urgency})")
        return {"success": True, "request": request}

    def acknowledge(self, request_id, by_user='system'):
        req = next((r for r in store.get_maintenance() if r['id'] == request_id), None)
        if not req:
            return {"success": False, "error": "So'rov topilmadi"}
        if req['status'] != 'open':
            return {"success": False, "error": f"So'rov 'open' holatida emas (joriy: {req['status']})"}

        technicians = store.get_technicians()
        tech = next((t for t in technicians if t['name'] == by_user or t['id'] == by_user), None)
        if not tech:
            tech = next((t for t in technicians if t.get('available')), None)
        if not tech:
            tech = {"id": 'tech_unknown', "name": by_user}

        store.update_maintenance(request_id, {
            "status": 'acknowledged',
            "acknowledgedAt": int(time.time() * 1000),
            "assignedTo": tech['id'],
            "assignedToName": tech['name'],
        })
        
        updated = next((r for r in store.get_maintenance() if r['id'] == request_id), None)
        broker.publish('maintenance.status_changed', {
            "request": updated, "oldStatus": 'open', "newStatus": 'acknowledged',
        })

        logger.info(f"[MAINTENANCE] {request_id} qabul qilindi ({tech['name']})")
        return {"success": True, "request": updated}

    def start(self, request_id, by_user='system'):
        req = next((r for r in store.get_maintenance() if r['id'] == request_id), None)
        if not req:
            return {"success": False, "error": "So'rov topilmadi"}
        if req['status'] not in ('acknowledged', 'open'):
            return {"success": False, "error": f"So'rovni boshlab bo'lmaydi (joriy: {req['status']})"}

        if req['status'] == 'open':
            self.acknowledge(request_id, by_user)

        req_updated = next((r for r in store.get_maintenance() if r['id'] == request_id), None)
        old_status = req_updated['status']
        
        store.update_maintenance(request_id, {
            "status": 'in_progress',
            "startedAt": int(time.time() * 1000),
        })
        
        updated = next((r for r in store.get_maintenance() if r['id'] == request_id), None)
        broker.publish('maintenance.status_changed', {
            "request": updated, "oldStatus": old_status, "newStatus": 'in_progress',
        })

        logger.info(f"[MAINTENANCE] {request_id} jarayonda ({by_user})")
        return {"success": True, "request": updated}

    def resolve(self, request_id, notes='', by_user='system'):
        req = next((r for r in store.get_maintenance() if r['id'] == request_id), None)
        if not req:
            return {"success": False, "error": "So'rov topilmadi"}
        if req['status'] == 'resolved':
            return {"success": False, "error": "So'rov allaqachon hal etilgan"}

        now = int(time.time() * 1000)
        patch = {
            "status": 'resolved',
            "resolvedAt": now,
            "resolutionNotes": notes,
            "resolvedBy": by_user,
        }
        if not req.get('acknowledgedAt'):
            patch["acknowledgedAt"] = now
        if not req.get('startedAt'):
            patch["startedAt"] = now

        old_status = req['status']
        store.update_maintenance(request_id, patch)
        updated = next((r for r in store.get_maintenance() if r['id'] == request_id), None)

        self.queue.remove(lambda r: r['id'] == request_id)
        store.increment_stat('totalMaintenanceResolved')

        broker.publish('maintenance.status_changed', {
            "request": updated, "oldStatus": old_status, "newStatus": 'resolved',
        })
        broker.publish('notification.created', {
            "type": 'maintenance_resolved',
            "severity": 'success',
            "message": f"{updated['roomNumber']}-xona: muammo hal etildi",
            "roomNumber": updated['roomNumber'],
            "requestId": request_id,
        })

        logger.info(f"[MAINTENANCE] So'rov hal etildi: {request_id}")
        return {"success": True, "request": updated}

    def get_queue(self):
        return [r for r in self.queue.to_array() if r.get('status') != 'resolved']

    def get_all(self):
        return store.get_maintenance()

    def get_by_id(self, id):
        return next((r for r in store.get_maintenance() if r['id'] == id), None)

maintenance_service = MaintenanceService()
