def assign_room(rooms, criteria):
    room_type = criteria.get('roomType')
    floor_preference = criteria.get('floorPreference')
    proximity_preference = criteria.get('proximityPreference', 'none')
    room_number = criteria.get('roomNumber')

    if room_number is not None:
        explicit = next((r for r in rooms if r.get('number') == room_number), None)
        if not explicit:
            return {"room": None, "reason": f"{room_number}-xona topilmadi"}
        if explicit.get('status') != 'available':
            return {"room": None, "reason": f"{room_number}-xona hozir bo'sh emas (holati: {explicit.get('status')})"}
        return {"room": explicit, "reason": f"Operator {room_number}-xonani aniq tanladi"}

    candidates = [r for r in rooms if r.get('type') == room_type and r.get('status') == 'available']

    if not candidates:
        same_type = [r for r in rooms if r.get('type') == room_type]
        if not same_type:
            return {"room": None, "reason": f"So'ralgan turdagi xonalar ({room_type}) mehmonxonada mavjud emas"}
        return {"room": None, "reason": f"Barcha {room_type} xonalar band yoki hozircha tayyor emas. Iltimos, muqobil turni tanlang yoki kutish ro'yxatiga qo'shing."}

    if floor_preference is not None:
        same_floor = [r for r in candidates if r.get('floor') == floor_preference]
        if same_floor:
            candidates = same_floor

    candidates.sort(key=lambda x: x.get('lastCleanedAt') or 0)

    if proximity_preference == 'near_elevator':
        near = [r for r in candidates if r.get('nearElevator')]
        if near:
            candidates = near
    elif proximity_preference == 'near_stairs':
        near = [r for r in candidates if r.get('nearStairs')]
        if near:
            candidates = near

    selected = candidates[0]
    return {"room": selected, "reason": build_reason(selected, criteria)}

def build_reason(room, criteria):
    parts = [f"{room.get('type')} turidagi mos xona topildi"]
    floor_pref = criteria.get('floorPreference')
    if floor_pref is not None:
        if room.get('floor') == floor_pref:
            parts.append(f"{floor_pref}-qavatdagi xona")
        else:
            parts.append(f"{floor_pref}-qavatda mavjud emas, {room.get('floor')}-qavat tanlandi")
            
    prox_pref = criteria.get('proximityPreference', 'none')
    if prox_pref == 'near_elevator' and room.get('nearElevator'):
        parts.append("liftga yaqin")
    if prox_pref == 'near_stairs' and room.get('nearStairs'):
        parts.append("zinapoyaga yaqin")
        
    return " · ".join(parts)
