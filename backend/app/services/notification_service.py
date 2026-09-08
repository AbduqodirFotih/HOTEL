import time
import secrets
import asyncio
from app.broker.message_broker import broker
from app.data.store import store
from app.utils.logger import logger

ONE_HOUR = 1000 * 60 * 60
CHECK_INTERVAL_MS = 60 * 1000

def gen_id():
    return f"notif_{int(time.time() * 1000)}_{secrets.token_hex(3)}"

class NotificationService:
    def __init__(self):
        self.name = 'notification'
        self._task = None
        self._subscribe()
        logger.info('[NOTIFICATION] Servis ishga tushdi')

    def _subscribe(self):
        def on_notification_created(event):
            settings = store.get_settings()
            payload = event.get('payload', {})
            notif = {
                "id": gen_id(),
                "type": payload.get('type', 'info'),
                "severity": payload.get('severity', 'info'),
                "message": payload.get('message'),
                "roomNumber": payload.get('roomNumber'),
                "orderId": payload.get('orderId'),
                "requestId": payload.get('requestId'),
                "createdAt": int(time.time() * 1000),
                "read": False,
                "soundEnabled": settings.get('notificationSound', True),
            }
            store.add_notification(notif)
            
        broker.subscribe('notification.created', on_notification_created)

    async def _loop(self):
        await asyncio.sleep(5)
        self.check_cleaning_schedule()
        while True:
            await asyncio.sleep(CHECK_INTERVAL_MS / 1000)
            self.check_cleaning_schedule()

    def start_periodic_check(self):
        if self._task:
            self._task.cancel()
        loop = asyncio.get_running_loop()
        self._task = loop.create_task(self._loop())

    def check_cleaning_schedule(self):
        settings = store.get_settings()
        threshold_hours = settings.get('cleaningThresholdHours', 12)
        threshold_ms = threshold_hours * ONE_HOUR
        now = int(time.time() * 1000)
        rooms = store.get_rooms()
        triggered = 0

        for room in rooms:
            if room.get('status') in ('cleaning', 'maintenance', 'cleaning_required', 'inspection'):
                continue
                
            elapsed = now - room.get('lastCleanedAt', 0)
            if elapsed < threshold_ms:
                continue
                
            last_reminder = room.get('cleaningReminderSentAt', 0)
            if (now - last_reminder) < threshold_ms:
                continue
                
            store.update_room(room['number'], {"cleaningReminderSentAt": now})

            if room.get('status') == 'occupied':
                broker.publish('notification.created', {
                    "type": 'occupied_room_cleaning_due',
                    "severity": 'warning',
                    "targetRole": 'housekeeping',
                    "message": f"🛎 {room['number']}-xona (BAND) {round(elapsed / ONE_HOUR)} soatdan beri tozalanmagan. Mehmon bilan kelishib tozalang.",
                    "roomNumber": room['number'],
                })
                triggered += 1
                continue

            broker.publish('room.cleaning_required', {
                "roomNumber": room['number'],
                "elapsedHours": round(elapsed / ONE_HOUR),
                "thresholdHours": threshold_hours,
            })

            broker.publish('notification.created', {
                "type": 'cleaning_reminder',
                "severity": 'warning',
                "targetRole": 'housekeeping',
                "message": f"🧹 {room['number']}-xona {round(elapsed / ONE_HOUR)} soatdan beri tozalanmagan. Yangi mehmonlardan oldin tozalash kerak.",
                "roomNumber": room['number'],
            })
            triggered += 1

        if triggered > 0:
            logger.info(f"[NOTIFICATION] Tozalash bildirishnomasi yuborildi: {triggered} xona")

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

notification_service = NotificationService()
