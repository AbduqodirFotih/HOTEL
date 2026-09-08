import time

URGENCY_RANK = {
    'critical': 4,
    'high': 3,
    'normal': 2,
    'low': 1,
}

class PriorityQueue:
    def __init__(self):
        self.items = []
        
    def enqueue(self, value, urgency='normal', submitted_at=None):
        if submitted_at is None:
            submitted_at = int(time.time() * 1000)
        priority = URGENCY_RANK.get(urgency, URGENCY_RANK['normal'])
        self.items.append({
            "value": value,
            "priority": priority,
            "urgency": urgency,
            "submittedAt": submitted_at
        })
        self._sort()
        return value

    def dequeue(self):
        if not self.items:
            return None
        return self.items.pop(0)["value"]
        
    def peek(self):
        if not self.items:
            return None
        return self.items[0]["value"]
        
    def remove(self, predicate):
        for i, item in enumerate(self.items):
            if predicate(item["value"]):
                return self.items.pop(i)["value"]
        return None
        
    def to_array(self):
        return [item["value"] for item in self.items]
        
    def size(self):
        return len(self.items)
        
    def is_empty(self):
        return len(self.items) == 0
        
    def _sort(self):
        self.items.sort(key=lambda x: (-x["priority"], x["submittedAt"]))
