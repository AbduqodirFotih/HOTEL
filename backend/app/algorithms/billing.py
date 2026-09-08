import time
import math

ONE_DAY_MS = 1000 * 60 * 60 * 24

def calculate_bill(params):
    guest = params.get('guest')
    room = params.get('room')
    orders = params.get('orders', [])
    extra_charges = params.get('extraCharges', [])
    discount = params.get('discount')
    check_out_at = params.get('checkOutAt', int(time.time() * 1000))
    
    if not guest or not room:
        raise ValueError("calculate_bill: mehmon va xona talab qilinadi")
        
    elapsed_ms = max(0, check_out_at - guest['checkInAt'])
    actual_nights = max(1, math.ceil(elapsed_ms / ONE_DAY_MS))
    billed_nights = min(actual_nights, guest['nights'])
    
    room_charge = room['nightlyRate'] * billed_nights
    
    guest_orders = [o for o in orders if o.get('roomNumber') == room['number'] and o.get('status') == 'delivered']
    order_charges = sum(o.get('total', 0) for o in guest_orders)
    
    extras = sum(e.get('amount', 0) for e in extra_charges)
    
    subtotal = room_charge + order_charges + extras
    
    discount_amount = 0
    if discount:
        if discount.get('type') == 'percent':
            discount_amount = round(subtotal * (discount.get('value', 0) / 100))
        elif discount.get('type') == 'flat':
            discount_amount = min(discount.get('value', 0), subtotal)
            
    total = max(0, subtotal - discount_amount)
    
    return {
        "roomNumber": room['number'],
        "guestName": guest['name'],
        "checkInAt": guest['checkInAt'],
        "checkOutAt": check_out_at,
        "nights": billed_nights,
        "nightlyRate": room['nightlyRate'],
        "roomCharge": room_charge,
        "orders": [
            {
                "id": o['id'],
                "items": o.get('items', []),
                "total": o.get('total', 0),
                "deliveredAt": o.get('deliveredAt')
            } for o in guest_orders
        ],
        "orderCharges": order_charges,
        "extraCharges": extras,
        "extraChargeDetails": extra_charges,
        "subtotal": subtotal,
        "discount": discount,
        "discountAmount": discount_amount,
        "total": total,
        "currency": 'UZS',
    }
