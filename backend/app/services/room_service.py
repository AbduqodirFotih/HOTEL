import time
import secrets
from app.broker.message_broker import broker
from app.data.store import store
from app.utils.logger import logger

ORDER_FLOW = ['received', 'preparing', 'delivering', 'delivered']

def gen_id():
    return f"order_{int(time.time() * 1000)}_{secrets.token_hex(3)}"

class RoomServiceService:
    def __init__(self):
        self.name = 'roomservice'
        logger.info('[ROOMSERVICE] Servis ishga tushdi')

    def create_order(self, params):
        room_number = params.get('roomNumber')
        items = params.get('items', [])
        
        room = store.get_room(room_number)
        if not room:
            return {"success": False, "error": f"{room_number}-xona topilmadi"}
        if room.get('status') != 'occupied':
            return {"success": False, "error": f"{room_number}-xona band emas — buyurtma qabul qilinmaydi"}

        enriched = []
        total = 0
        for item in items:
            menu_item = store.get_menu_item(item.get('itemId'))
            if not menu_item:
                return {"success": False, "error": f"Menyuda topilmadi: {item.get('itemId')}"}
                
            line_total = menu_item['price'] * item.get('quantity', 1)
            enriched.append({
                "itemId": menu_item['id'],
                "name": menu_item['name'],
                "quantity": item.get('quantity', 1),
                "unitPrice": menu_item['price'],
                "lineTotal": line_total,
            })
            total += line_total

        order = {
            "id": gen_id(),
            "roomNumber": room_number,
            "items": enriched,
            "total": total,
            "status": 'received',
            "createdAt": int(time.time() * 1000),
            "statusHistory": [{"status": 'received', "at": int(time.time() * 1000)}],
        }

        store.add_order(order)

        broker.publish('order.created', {"order": order})
        broker.publish('order.status_changed', {"order": order, "oldStatus": None, "newStatus": 'received'})
        broker.publish('notification.created', {
            "type": 'order_received',
            "severity": 'info',
            "message": f"Yangi buyurtma: {room_number}-xona, jami {total} UZS",
            "roomNumber": room_number,
            "orderId": order['id'],
        })

        logger.info(f"[ROOMSERVICE] Buyurtma yaratildi: {order['id']} ({room_number}-xona)")
        return {"success": True, "order": order}

    def advance_order(self, order_id):
        orders = store.get_orders()
        order = next((o for o in orders if o['id'] == order_id), None)
        if not order:
            return {"success": False, "error": "Buyurtma topilmadi"}

        try:
            idx = ORDER_FLOW.index(order['status'])
        except ValueError:
            idx = -1
            
        if idx == -1 or idx == len(ORDER_FLOW) - 1:
            return {"success": False, "error": f"Buyurtma allaqachon yakunlangan: {order['status']}"}

        old_status = order['status']
        new_status = ORDER_FLOW[idx + 1]
        now = int(time.time() * 1000)

        patch = {
            "status": new_status,
            "statusHistory": order.get('statusHistory', []) + [{"status": new_status, "at": now}],
        }
        if new_status == 'delivered':
            patch["deliveredAt"] = now

        store.update_order(order_id, patch)
        updated = next((o for o in store.get_orders() if o['id'] == order_id), None)

        broker.publish('order.status_changed', {"order": updated, "oldStatus": old_status, "newStatus": new_status})
        
        severity = 'success' if new_status == 'delivered' else 'info'
        broker.publish('notification.created', {
            "type": 'order_status',
            "severity": severity,
            "message": f"{updated['roomNumber']}-xona buyurtmasi: {new_status}",
            "roomNumber": updated['roomNumber'],
            "orderId": order_id,
        })

        logger.info(f"[ROOMSERVICE] {order_id}: {old_status} -> {new_status}")
        return {"success": True, "order": updated}

    def cancel_order(self, order_id, reason="Mehmon iltimosi bo'yicha"):
        orders = store.get_orders()
        order = next((o for o in orders if o['id'] == order_id), None)
        if not order:
            return {"success": False, "error": "Buyurtma topilmadi"}
            
        if order['status'] == 'delivered':
            return {"success": False, "error": "Yetkazilgan buyurtmani bekor qilib bo'lmaydi"}
            
        old_status = order['status']
        store.update_order(order_id, {
            "status": 'cancelled',
            "cancelledAt": int(time.time() * 1000),
            "cancellationReason": reason,
        })
        
        updated = next((o for o in store.get_orders() if o['id'] == order_id), None)
        broker.publish('order.status_changed', {"order": updated, "oldStatus": old_status, "newStatus": 'cancelled'})
        return {"success": True, "order": updated}

    def get_active_orders(self):
        return [o for o in store.get_orders() if o['status'] not in ('delivered', 'cancelled')]

room_service = RoomServiceService()
