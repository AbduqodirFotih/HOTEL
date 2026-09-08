import time
import random

NOW = int(time.time() * 1000)
DAY = 1000 * 60 * 60 * 24
HOUR = 1000 * 60 * 60

booking_history = [
    {
        "id": 'bk_h_001', "guestName": 'Aziz Karimov', "phone": '+998 90 111 22 33',
        "roomNumber": 101, "roomType": 'single', "checkInAt": NOW - 30 * DAY, "checkOutAt": NOW - 28 * DAY,
        "nights": 2, "totalRevenue": 700000, "paymentMethod": 'card',
        "services": [
            {"type": 'food', "name": 'Kontinental nonushta', "qty": 2, "price": 180000},
            {"type": 'drink', "name": 'Espresso', "qty": 4, "price": 100000},
        ],
    },
    {
        "id": 'bk_h_002', "guestName": 'Nilufar Sodiqova', "phone": '+998 91 234 56 78',
        "roomNumber": 204, "roomType": 'suite', "checkInAt": NOW - 28 * DAY, "checkOutAt": NOW - 25 * DAY,
        "nights": 3, "totalRevenue": 3600000, "paymentMethod": 'card',
        "services": [
            {"type": 'food', "name": 'Margarita pitsa', "qty": 2, "price": 240000},
            {"type": 'food', "name": 'Sezar salatasi', "qty": 1, "price": 55000},
            {"type": 'drink', "name": 'Tabiiy sharbat', "qty": 3, "price": 105000},
        ],
    },
]

maintenance_history = [
    {
        "id": 'mh_h_001',
        "roomNumber": 105,
        "relatedBookingId": 'bk_h_003',
        "category": 'plumbing',
        "urgency": 'high',
        "description": 'Hammomda sovuq suv kuchsiz oqyapti',
        "reportedBy": 'Qabul xodimi',
        "reportedAt": NOW - 24 * DAY,
        "acknowledgedBy": 'Akmal Rasulov',
        "acknowledgedAt": NOW - 24 * DAY + 12 * 60 * 1000,
        "startedAt": NOW - 24 * DAY + 25 * 60 * 1000,
        "resolvedBy": 'Akmal Rasulov',
        "resolvedAt": NOW - 24 * DAY + 95 * 60 * 1000,
        "resolutionNotes": 'Filtr almashtirildi, suv bosimi normallashdi',
        "durationMs": 95 * 60 * 1000,
    },
]

def generate_cleaning_history():
    records = []
    housekeepers_list = ['Munira Karimova', 'Dilfuza Saidova']
    rooms_list = [101, 102, 103, 104, 105, 201, 202, 203, 204, 205]

    for day in range(30, 0, -1):
        for room_number in rooms_list:
            for hour in [9, 21]:
                scheduled_at = NOW - day * DAY + hour * HOUR
                lateness = random.randint(0, 5 * 60 * 1000) if random.random() < 0.92 else 5 * 60 * 1000 + random.randint(0, 10 * 60 * 1000)
                actual_start = scheduled_at + lateness
                duration_min = 18 + random.randint(0, 12)
                completed_at = actual_start + duration_min * 60 * 1000
                housekeeper = random.choice(housekeepers_list)
                on_time = (actual_start - scheduled_at) < 10 * 60 * 1000

                records.append({
                    "id": f"ch_h_{day}_{room_number}_{hour}",
                    "roomNumber": room_number,
                    "scheduledAt": scheduled_at,
                    "startedAt": actual_start,
                    "completedAt": completed_at,
                    "durationMs": duration_min * 60 * 1000,
                    "cleanedBy": housekeeper,
                    "onTime": on_time,
                })
    return records

cleaning_history = generate_cleaning_history()

def calculate_performance():
    housekeepers_dict = {}
    for rec in cleaning_history:
        hk = rec["cleanedBy"]
        if hk not in housekeepers_dict:
            housekeepers_dict[hk] = {"total": 0, "onTime": 0, "totalDuration": 0}
        housekeepers_dict[hk]["total"] += 1
        if rec["onTime"]:
            housekeepers_dict[hk]["onTime"] += 1
        housekeepers_dict[hk]["totalDuration"] += rec["durationMs"]

    technicians_dict = {}
    for req in maintenance_history:
        tech = req["resolvedBy"]
        if tech not in technicians_dict:
            technicians_dict[tech] = {"total": 0, "totalResponseMs": 0, "totalDurationMs": 0}
        technicians_dict[tech]["total"] += 1
        technicians_dict[tech]["totalResponseMs"] += (req["acknowledgedAt"] - req["reportedAt"])
        technicians_dict[tech]["totalDurationMs"] += req["durationMs"]

    return {
        "housekeepers": [
            {
                "name": name,
                "totalCleanings": s["total"],
                "onTimePercent": round((s["onTime"] / s["total"]) * 100) if s["total"] else 0,
                "avgDurationMs": round(s["totalDuration"] / s["total"]) if s["total"] else 0,
            }
            for name, s in housekeepers_dict.items()
        ],
        "technicians": [
            {
                "name": name,
                "totalResolved": s["total"],
                "avgResponseMs": round(s["totalResponseMs"] / s["total"]) if s["total"] else 0,
                "avgResolutionMs": round(s["totalDurationMs"] / s["total"]) if s["total"] else 0,
            }
            for name, s in technicians_dict.items()
        ],
    }

staff_performance = calculate_performance()
