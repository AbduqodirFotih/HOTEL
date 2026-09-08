import re

class ValidationError(Exception):
    def __init__(self, message, field=None):
        super().__init__(message)
        self.message = message
        self.field = field
        self.status_code = 400

ROOM_TYPES = ['single', 'double', 'suite', 'accessible']
URGENCY_LEVELS = ['critical', 'high', 'normal', 'low']
PROXIMITY_PREF = ['none', 'near_elevator', 'near_stairs']

def require_string(value, field, min_len=1, max_len=200):
    if not isinstance(value, str):
        raise ValidationError(f"{field} matn (string) bo'lishi kerak", field)
    trimmed = value.strip()
    if len(trimmed) < min_len:
        raise ValidationError(f"{field} kamida {min_len} ta belgidan iborat bo'lishi kerak", field)
    if len(trimmed) > max_len:
        raise ValidationError(f"{field} {max_len} ta belgidan oshmasligi kerak", field)
    
    if re.search(r'[<>{}]', trimmed):
        raise ValidationError(f"{field} ruxsat etilmagan belgilarni o'z ichiga oladi", field)
    return trimmed

def require_int(value, field, min_val=None, max_val=None):
    try:
        n = int(value)
    except (ValueError, TypeError):
        raise ValidationError(f"{field} butun son bo'lishi kerak", field)
    
    if min_val is not None and n < min_val:
        raise ValidationError(f"{field} kamida {min_val} bo'lishi kerak", field)
    if max_val is not None and n > max_val:
        raise ValidationError(f"{field} {max_val} dan oshmasligi kerak", field)
    return n

def require_enum(value, allowed, field):
    if value not in allowed:
        raise ValidationError(f"{field} quyidagilardan biri bo'lishi kerak: {', '.join(allowed)}", field)
    return value

def validate_room_number(room_number, field='Xona raqami'):
    n = require_int(room_number, field, min_val=100, max_val=299)
    floor = n // 100
    idx = n % 100
    if floor < 1 or floor > 2 or idx < 1 or idx > 5:
        raise ValidationError(f"{field} mavjud emas (kutilgan: 101-105 yoki 201-205)", field)
    return n

def validate_check_in(body):
    guest_name = require_string(body.get('guestName'), 'Mehmon ismi', min_len=2, max_len=80)
    nights = require_int(body.get('nights'), 'Tunlar soni', min_val=1, max_val=90)
    
    floor_pref_val = body.get('floorPreference')
    floor_preference = require_int(floor_pref_val, 'Qavat afzalligi', min_val=1, max_val=2) if floor_pref_val is not None else None
    
    prox_pref_val = body.get('proximityPreference')
    proximity_preference = require_enum(prox_pref_val, PROXIMITY_PREF, 'Yaqinlik afzalligi') if prox_pref_val else 'none'
    
    room_number = None
    room_type = None
    
    rn_val = body.get('roomNumber')
    if rn_val is not None:
        room_number = validate_room_number(rn_val, 'Xona raqami')
        if body.get('roomType'):
            room_type = require_enum(body.get('roomType'), ROOM_TYPES, 'Xona turi')
    else:
        room_type = require_enum(body.get('roomType'), ROOM_TYPES, 'Xona turi')
        
    phone_val = body.get('phone')
    phone = require_string(phone_val, 'Telefon', min_len=4, max_len=40) if phone_val else None
    
    return {
        "guestName": guest_name,
        "roomType": room_type,
        "roomNumber": room_number,
        "nights": nights,
        "floorPreference": floor_preference,
        "proximityPreference": proximity_preference,
        "phone": phone
    }

def validate_order(body):
    room_number = validate_room_number(body.get('roomNumber'))
    items_raw = body.get('items')
    if not isinstance(items_raw, list) or len(items_raw) == 0:
        raise ValidationError("Buyurtma kamida bitta mahsulot bo'lishi kerak", 'items')
    if len(items_raw) > 20:
        raise ValidationError("Bitta buyurtmada 20 dan ortiq mahsulot bo'lmasligi kerak", 'items')
        
    items = []
    for i, it in enumerate(items_raw):
        if not it or not isinstance(it, dict):
            raise ValidationError(f"Mahsulot {i + 1} noto'g'ri", 'items')
        item_id = require_string(it.get('itemId'), f"items[{i}].itemId", min_len=1, max_len=40)
        quantity = require_int(it.get('quantity'), f"items[{i}].quantity", min_val=1, max_val=20)
        items.append({"itemId": item_id, "quantity": quantity})
        
    return {"roomNumber": room_number, "items": items}

def validate_maintenance(body):
    room_number = validate_room_number(body.get('roomNumber'))
    description = require_string(body.get('description'), 'Tavsif', min_len=5, max_len=300)
    urgency = require_enum(body.get('urgency'), URGENCY_LEVELS, 'Shoshilinchlik darajasi')
    category = require_string(body.get('category', 'other'), 'Kategoriya', min_len=2, max_len=40)
    return {"roomNumber": room_number, "description": description, "urgency": urgency, "category": category}

def validate_login(body):
    username = require_string(body.get('username'), 'Foydalanuvchi nomi', min_len=3, max_len=40)
    password = require_string(body.get('password'), 'Parol', min_len=4, max_len=100)
    return {"username": username, "password": password}
