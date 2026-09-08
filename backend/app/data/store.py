import os
import json
import threading
from app.utils.logger import logger
from app.data import seed_data

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data.json')
SAVE_DEBOUNCE_MS = 1.0

class Store:
    def __init__(self):
        self.state = None
        self._save_timer = None
        self.lock = threading.RLock()
        self._load()

    def _load(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.state = json.load(f)
                self._ensure_fields()
                self._migrate_statuses()
                logger.info(f"[STORE] data.json dan yuklandi ({len(self.state['rooms'])} xona)")
                return
            except Exception as err:
                logger.error(f"[STORE] data.json o'qishda xato, urug'lik ma'lumotlardan boshlaymiz: {err}")
        self._seed()

    def _migrate_statuses(self):
        mapping = {
            'clean': 'available',
            'dirty': 'cleaning_required',
        }
        migrated = 0
        for room in self.state["rooms"]:
            if room.get("status") in mapping:
                room["status"] = mapping[room["status"]]
                migrated += 1
        if migrated > 0:
            logger.info(f"[STORE] Eski statuslardan {migrated} ta xona ko'chirildi")
            self.schedule_save()

    def _seed(self):
        import copy
        self.state = {
            "rooms": copy.deepcopy(seed_data.rooms),
            "menu": copy.deepcopy(seed_data.menu),
            "technicians": copy.deepcopy(seed_data.technicians),
            "housekeepers": copy.deepcopy(seed_data.housekeepers),
            "guests": copy.deepcopy(seed_data.guests),
            "orders": copy.deepcopy(seed_data.orders),
            "maintenanceRequests": copy.deepcopy(seed_data.maintenanceRequests),
            "notifications": copy.deepcopy(seed_data.notifications),
            "bookingHistory": copy.deepcopy(seed_data.bookingHistory),
            "maintenanceHistory": copy.deepcopy(seed_data.maintenanceHistory),
            "cleaningHistory": copy.deepcopy(seed_data.cleaningHistory),
            "staffPerformance": copy.deepcopy(seed_data.staffPerformance),
            "settings": {
                "cleaningThresholdHours": 12,
                "autoNotifyHousekeeping": True,
                "notificationSound": True,
                "language": 'uz',
                "theme": 'light',
                "density": 'comfortable',
                "currency": 'UZS',
                "autoRefreshSec": 5,
                "dashboardShowEvents": True,
                "showRoomTimers": True,
            },
            "stats": {
                "totalCheckIns": 0,
                "totalCheckOuts": 0,
                "totalRevenue": 0,
                "totalOrders": 0,
                "totalMaintenance": 0,
            },
        }
        self._save()
        logger.info("[STORE] Urug'lik ma'lumotlardan boshlandi")

    def _ensure_fields(self):
        defaults = {
            "rooms": [], "menu": [], "technicians": [], "housekeepers": [],
            "guests": [], "orders": [], "maintenanceRequests": [], "notifications": [],
            "bookingHistory": [], "maintenanceHistory": [], "cleaningHistory": [], "staffPerformance": {},
            "settings": {
                "cleaningThresholdHours": 12,
                "autoNotifyHousekeeping": True,
                "notificationSound": True,
                "language": 'uz',
                "theme": 'light',
                "density": 'comfortable',
                "currency": 'UZS',
                "autoRefreshSec": 5,
                "dashboardShowEvents": True,
                "showRoomTimers": True,
            },
            "stats": {"totalCheckIns": 0, "totalCheckOuts": 0, "totalRevenue": 0, "totalOrders": 0, "totalMaintenance": 0},
        }
        for k, v in defaults.items():
            if self.state.get(k) is None:
                self.state[k] = v

    def schedule_save(self):
        with self.lock:
            if self._save_timer:
                self._save_timer.cancel()
            self._save_timer = threading.Timer(SAVE_DEBOUNCE_MS, self._save)
            self._save_timer.start()

    def _save(self):
        with self.lock:
            try:
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(self.state, f, indent=2, ensure_ascii=False)
            except Exception as err:
                logger.error(f"[STORE] data.json yozishda xato: {err}")

    def reset(self):
        with self.lock:
            self._seed()

    # Rooms
    def get_rooms(self):
        return self.state["rooms"]

    def get_room(self, number):
        for r in self.state["rooms"]:
            if r["number"] == int(number):
                return r
        return None

    def update_room(self, number, patch):
        with self.lock:
            room = self.get_room(number)
            if not room:
                return None
            room.update(patch)
            self.schedule_save()
            return room

    # Guests
    def get_guests(self):
        return self.state["guests"]

    def get_guest(self, guest_id):
        for g in self.state["guests"]:
            if g["id"] == guest_id:
                return g
        return None

    def add_guest(self, guest):
        with self.lock:
            self.state["guests"].append(guest)
            self.schedule_save()
            return guest

    def remove_guest(self, guest_id):
        with self.lock:
            for i, g in enumerate(self.state["guests"]):
                if g["id"] == guest_id:
                    removed = self.state["guests"].pop(i)
                    self.schedule_save()
                    return removed
            return None

    # Orders
    def get_orders(self):
        return self.state["orders"]

    def add_order(self, order):
        with self.lock:
            self.state["orders"].append(order)
            self.state["stats"]["totalOrders"] += 1
            self.schedule_save()
            return order

    def update_order(self, order_id, patch):
        with self.lock:
            for o in self.state["orders"]:
                if o["id"] == order_id:
                    o.update(patch)
                    self.schedule_save()
                    return o
            return None

    # Maintenance
    def get_maintenance(self):
        return self.state["maintenanceRequests"]

    def add_maintenance(self, req):
        with self.lock:
            self.state["maintenanceRequests"].append(req)
            self.state["stats"]["totalMaintenance"] += 1
            self.schedule_save()
            return req

    def update_maintenance(self, req_id, patch):
        with self.lock:
            for r in self.state["maintenanceRequests"]:
                if r["id"] == req_id:
                    r.update(patch)
                    self.schedule_save()
                    return r
            return None

    # Notifications
    def get_notifications(self, limit=50):
        return self.state["notifications"][-limit:][::-1]

    def add_notification(self, notif):
        with self.lock:
            self.state["notifications"].append(notif)
            if len(self.state["notifications"]) > 200:
                self.state["notifications"] = self.state["notifications"][-200:]
            self.schedule_save()
            return notif

    def mark_notification_read(self, notif_id):
        with self.lock:
            for n in self.state["notifications"]:
                if n["id"] == notif_id:
                    n["read"] = True
                    self.schedule_save()
                    return n
            return None

    def clear_read_notifications(self):
        with self.lock:
            self.state["notifications"] = [n for n in self.state["notifications"] if not n.get("read")]
            self.schedule_save()

    # Menu / Staff
    def get_menu(self):
        return self.state["menu"]

    def get_menu_item(self, item_id):
        for m in self.state["menu"]:
            if m["id"] == item_id:
                return m
        return None

    def get_technicians(self):
        return self.state["technicians"]

    def get_housekeepers(self):
        return self.state["housekeepers"]

    # Settings
    def get_settings(self):
        return self.state["settings"]

    def update_settings(self, patch):
        with self.lock:
            self.state["settings"].update(patch)
            self.schedule_save()
            return self.state["settings"]

    # Stats
    def get_stats(self):
        return self.state["stats"]

    def increment_stat(self, key, by=1):
        with self.lock:
            if key in self.state["stats"]:
                self.state["stats"][key] += by
                self.schedule_save()

    # Historical
    def get_booking_history(self):
        return self.state.get("bookingHistory", [])

    def get_maintenance_history(self):
        return self.state.get("maintenanceHistory", [])

    def get_cleaning_history(self):
        return self.state.get("cleaningHistory", [])

    def get_staff_performance(self):
        return self.state.get("staffPerformance", {})

store = Store()
