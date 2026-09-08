import asyncio
import time
import random
import string
from datetime import datetime
from app.utils.logger import logger

class MessageBroker:
    def __init__(self):
        self.subscribers = {}
        self.event_log = []
        self.max_log_size = 200

    def subscribe(self, topic, handler):
        if topic not in self.subscribers:
            self.subscribers[topic] = set()
        self.subscribers[topic].add(handler)
        logger.debug(f"[BROKER] Obuna qo'shildi: {topic}")
        
        def unsubscribe():
            if topic in self.subscribers and handler in self.subscribers[topic]:
                self.subscribers[topic].remove(handler)
        return unsubscribe

    def publish(self, topic, payload=None):
        if payload is None:
            payload = {}
            
        event_id = f"evt_{int(time.time() * 1000)}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=6))}"
        event = {
            "id": event_id,
            "topic": topic,
            "payload": payload,
            "publishedAt": datetime.now().isoformat() + "Z"
        }
        
        self.event_log.append(event)
        if len(self.event_log) > self.max_log_size:
            self.event_log.pop(0)
            
        logger.info(f"[BROKER] {topic}", payload)
        
        handlers = self.subscribers.get(topic, set())
        if not handlers:
            return event
            
        for handler in handlers:
            try:
                # If the handler is a coroutine function, schedule it
                if asyncio.iscoroutinefunction(handler):
                    # We assume an event loop is running (which is true in FastAPI)
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(handler(event))
                    except RuntimeError:
                        # Fallback if no loop is running
                        asyncio.run(handler(event))
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"[BROKER] Handler xatosi ({topic}):", str(e))
                
        return event

    def get_recent_events(self, limit=50):
        return self.event_log[-limit:][::-1]

    def list_topics(self):
        return list(self.subscribers.keys())

broker = MessageBroker()
