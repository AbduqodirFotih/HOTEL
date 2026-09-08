import time
from fastapi import APIRouter, Depends, HTTPException, Request, Body, Query, Path
from typing import Optional, Dict, Any

from app.broker.message_broker import broker
from app.data.store import store
from app.utils.auth import RequirePermission, login, logout, public_policy, sanitize_for_role
from app.utils.logger import logger
from app.utils.validator import (
    ValidationError, validate_login, validate_check_in, validate_room_number,
    validate_order, validate_maintenance
)

from app.services.reception_service import reception_service
from app.services.housekeeping_service import housekeeping_service
from app.services.room_service import room_service
from app.services.maintenance_service import maintenance_service

router = APIRouter()

# ----------------- Exceptions -----------------
import fastapi
@router.post("/auth/login")
def api_login(payload: dict = Body(...)):
    try:
        data = validate_login(payload)
        result = login(data["username"], data["password"])
        if not result:
            raise HTTPException(status_code=401, detail="Foydalanuvchi nomi yoki parol noto'g'ri")
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/auth/logout")
def api_logout(session: dict = Depends(RequirePermission("dashboard.view"))): # Need any permission to logout, dashboard.view is good enough or use require_auth
    # Actually requireAuth is enough, but I'll implement logout via token
    # FastAPI can't easily extract just token from Depends unless we do it directly.
    pass # Wait, logout is handled below better.

from app.utils.auth import require_auth
@router.post("/auth/logout")
def api_logout_auth(session: dict = Depends(require_auth), request: Request = None):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "")
    logout(token)
    return {"success": True}

@router.get("/auth/me")
def api_auth_me(session: dict = Depends(require_auth)):
    return {
        "user": {
            "username": session["username"],
            "role": session["role"],
            "displayName": session["displayName"]
        },
        "policy": public_policy(session["role"])
    }

# ----------------- RECEPTION -----------------
@router.post("/reception/checkin")
def api_checkin(payload: dict = Body(...), session: dict = Depends(RequirePermission("reception.checkin"))):
    try:
        data = validate_check_in(payload)
        result = reception_service.check_in(data)
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/reception/checkout/{roomNumber}")
def api_checkout(roomNumber: str, payload: dict = Body({}), session: dict = Depends(RequirePermission("reception.checkout"))):
    try:
        rn = validate_room_number(roomNumber)
        result = reception_service.check_out(rn, payload)
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.get("/reception/inventory")
def api_inventory(session: dict = Depends(RequirePermission("reception.inventory"))):
    data = reception_service.get_inventory()
    return sanitize_for_role(data, session["role"])

# ----------------- HOUSEKEEPING -----------------
@router.get("/housekeeping/queue")
def api_hk_queue(session: dict = Depends(RequirePermission("housekeeping.queue.view"))):
    return {"queue": housekeeping_service.get_queue()}

@router.post("/housekeeping/start/{roomNumber}")
def api_hk_start(roomNumber: str, session: dict = Depends(RequirePermission("housekeeping.start"))):
    try:
        rn = validate_room_number(roomNumber)
        result = housekeeping_service.start_cleaning(rn, session.get("displayName") or session.get("username"))
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/housekeeping/complete/{roomNumber}")
def api_hk_complete(roomNumber: str, session: dict = Depends(RequirePermission("housekeeping.complete"))):
    try:
        rn = validate_room_number(roomNumber)
        result = housekeeping_service.mark_clean(rn, session.get("displayName") or session.get("username"))
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/housekeeping/queue/{roomNumber}")
def api_hk_enqueue(roomNumber: str, session: dict = Depends(RequirePermission("housekeeping.enqueue"))):
    try:
        rn = validate_room_number(roomNumber)
        result = housekeeping_service.add_to_cleaning_queue(rn, 'manual')
        if not result:
            return fastapi.responses.JSONResponse(status_code=409, content={"error": "Xona navbatga qo'shilmadi (allaqachon navbatda yoki band)"})
        return {"success": True, "entry": result}
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

# ----------------- RECEPTION EXTRA -----------------
@router.post("/reception/confirm-available/{roomNumber}")
def api_confirm_available(roomNumber: str, session: dict = Depends(RequirePermission("reception.confirm_available"))):
    try:
        rn = validate_room_number(roomNumber)
        result = reception_service.confirm_available(rn)
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/reception/mark-needs-cleaning/{roomNumber}")
def api_mark_needs_cleaning(roomNumber: str, session: dict = Depends(RequirePermission("reception.mark_needs_cleaning"))):
    try:
        rn = validate_room_number(roomNumber)
        result = reception_service.mark_needs_cleaning(rn)
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

# ----------------- ROOM SERVICE -----------------
@router.get("/orders")
def api_orders_get(session: dict = Depends(RequirePermission("orders.view"))):
    data = {"orders": store.get_orders()[::-1]}
    return sanitize_for_role(data, session["role"])

@router.get("/orders/active")
def api_orders_active(session: dict = Depends(RequirePermission("orders.view"))):
    data = {"orders": room_service.get_active_orders()}
    return sanitize_for_role(data, session["role"])

@router.post("/orders")
def api_orders_create(payload: dict = Body(...), session: dict = Depends(RequirePermission("orders.create"))):
    try:
        data = validate_order(payload)
        result = room_service.create_order(data)
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/orders/{id}/advance")
def api_orders_advance(id: str, session: dict = Depends(RequirePermission("orders.advance"))):
    result = room_service.advance_order(id)
    if not result.get("success"):
        return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
    return result

@router.post("/orders/{id}/cancel")
def api_orders_cancel(id: str, payload: dict = Body(None), session: dict = Depends(RequirePermission("orders.cancel"))):
    reason = payload.get("reason", "Mehmon iltimosi bo'yicha") if payload else "Mehmon iltimosi bo'yicha"
    result = room_service.cancel_order(id, reason)
    if not result.get("success"):
        return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
    return result

@router.get("/menu")
def api_menu(session: dict = Depends(RequirePermission("orders.menu"))):
    return {"menu": store.get_menu()}

# ----------------- MAINTENANCE -----------------
@router.get("/maintenance")
def api_maint_get(session: dict = Depends(RequirePermission("maintenance.view"))):
    return {"requests": maintenance_service.get_all()[::-1]}

@router.get("/maintenance/queue")
def api_maint_queue(session: dict = Depends(RequirePermission("maintenance.view"))):
    return {"queue": maintenance_service.get_queue()}

@router.post("/maintenance")
def api_maint_create(payload: dict = Body(...), session: dict = Depends(RequirePermission("maintenance.report"))):
    try:
        data = validate_maintenance(payload)
        result = maintenance_service.report(data, session.get("displayName") or session.get("username"))
        if not result.get("success"):
            return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
        return result
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/maintenance/{id}/acknowledge")
def api_maint_ack(id: str, session: dict = Depends(RequirePermission("maintenance.acknowledge"))):
    result = maintenance_service.acknowledge(id, session.get("displayName") or session.get("username"))
    if not result.get("success"):
        return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
    return result

@router.post("/maintenance/{id}/start")
def api_maint_start(id: str, session: dict = Depends(RequirePermission("maintenance.start"))):
    result = maintenance_service.start(id, session.get("displayName") or session.get("username"))
    if not result.get("success"):
        return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
    return result

@router.post("/maintenance/{id}/resolve")
def api_maint_resolve(id: str, payload: dict = Body(None), session: dict = Depends(RequirePermission("maintenance.resolve"))):
    notes = payload.get("notes", "") if payload else ""
    result = maintenance_service.resolve(id, notes, session.get("displayName") or session.get("username"))
    if not result.get("success"):
        return fastapi.responses.JSONResponse(status_code=409, content={"error": result.get("error")})
    return result

# ----------------- MANAGER -----------------
@router.post("/manager/remind/housekeeping/{roomNumber}")
def api_mgr_remind_hk(roomNumber: str, payload: dict = Body(None), session: dict = Depends(RequirePermission("manager.remind_housekeeping"))):
    try:
        rn = validate_room_number(roomNumber)
        room = store.get_room(rn)
        if not room:
            return fastapi.responses.JSONResponse(status_code=404, content={"error": f"{rn}-xona topilmadi"})
            
        sender = session.get("displayName") or session.get("username")
        msg = payload.get("message", "Iltimos, ushbu xonani vaqtida tozalang").strip() if payload and payload.get("message") else "Iltimos, ushbu xonani vaqtida tozalang"

        broker.publish('notification.created', {
            "type": 'manager_reminder',
            "severity": 'warning',
            "targetRole": 'housekeeping',
            "message": f"🔔 {sender}dan eslatma: {rn}-xona — {msg}",
            "roomNumber": rn,
            "sender": sender,
        })
        
        broker.publish('manager.reminder_sent', {
            "target": 'housekeeping',
            "roomNumber": rn,
            "sender": sender,
            "message": msg,
            "sentAt": int(time.time() * 1000),
        })

        logger.info(f"[MANAGER] {sender} -> housekeeping eslatmasi (xona {rn})")
        return {"success": True, "sent": {"to": 'housekeeping', "roomNumber": rn, "message": msg}}
    except ValidationError as e:
        return fastapi.responses.JSONResponse(status_code=400, content={"error": e.message, "field": e.field})

@router.post("/manager/remind/maintenance/{id}")
def api_mgr_remind_maint(id: str, payload: dict = Body(None), session: dict = Depends(RequirePermission("manager.remind_maintenance"))):
    request = maintenance_service.get_by_id(id)
    if not request:
        return fastapi.responses.JSONResponse(status_code=404, content={"error": f"So'rov {id} topilmadi"})

    sender = session.get("displayName") or session.get("username")
    msg = payload.get("message", "Iltimos, muammoni tezroq hal qiling").strip() if payload and payload.get("message") else "Iltimos, muammoni tezroq hal qiling"

    broker.publish('notification.created', {
        "type": 'manager_reminder',
        "severity": 'warning',
        "targetRole": 'maintenance',
        "message": f"🔔 {sender}dan eslatma: {request['roomNumber']}-xona texnik so'rovi — {msg}",
        "roomNumber": request['roomNumber'],
        "requestId": id,
        "sender": sender,
    })

    broker.publish('manager.reminder_sent', {
        "target": 'maintenance',
        "requestId": id,
        "roomNumber": request['roomNumber'],
        "sender": sender,
        "message": msg,
        "sentAt": int(time.time() * 1000),
    })

    logger.info(f"[MANAGER] {sender} -> maintenance eslatmasi (so'rov {id})")
    return {"success": True, "sent": {"to": 'maintenance', "requestId": id, "message": msg}}

@router.get("/manager/history")
def api_mgr_history(session: dict = Depends(RequirePermission("history.view"))):
    return {
        "bookings": store.get_booking_history(),
        "maintenanceHistory": store.get_maintenance_history(),
        "cleaningHistory": store.get_cleaning_history(),
        "staffPerformance": store.get_staff_performance(),
    }

# ----------------- NOTIFICATIONS -----------------
@router.get("/notifications")
def api_notif_get(limit: int = 50, session: dict = Depends(RequirePermission("notifications.view"))):
    limit = min(max(limit, 1), 200)
    return {"notifications": store.get_notifications(limit)}

@router.post("/notifications/{id}/read")
def api_notif_read(id: str, session: dict = Depends(RequirePermission("notifications.modify"))):
    store.mark_notification_read(id)
    return {"success": True}

@router.post("/notifications/clear-read")
def api_notif_clear(session: dict = Depends(RequirePermission("notifications.modify"))):
    store.clear_read_notifications()
    return {"success": True}

# ----------------- SETTINGS -----------------
@router.get("/settings")
def api_set_get(session: dict = Depends(RequirePermission("settings.view"))):
    return {"settings": store.get_settings()}

@router.put("/settings")
def api_set_put(payload: dict = Body(...), session: dict = Depends(RequirePermission("settings.update"))):
    allowed = [
        'cleaningThresholdHours', 'autoNotifyHousekeeping', 'notificationSound',
        'language', 'theme', 'density', 'currency', 'autoRefreshSec',
        'dashboardShowEvents', 'showRoomTimers'
    ]
    patch = {}
    for k in allowed:
        if k in payload:
            patch[k] = payload[k]
    settings = store.update_settings(patch)
    return {"settings": settings}

@router.post("/settings/reset-data")
def api_set_reset(session: dict = Depends(RequirePermission("settings.reset"))):
    store.reset()
    return {"success": True}

# ----------------- DASHBOARD -----------------
@router.get("/dashboard/summary")
def api_dash_summary(session: dict = Depends(RequirePermission("dashboard.view"))):
    inv = reception_service.get_inventory()
    payload = {
        "rooms": inv["rooms"],
        "summary": inv["summary"],
        "activeOrders": room_service.get_active_orders(),
        "openMaintenance": maintenance_service.get_queue(),
        "cleaningQueue": housekeeping_service.get_queue(),
        "notifications": store.get_notifications(20),
        "guests": store.get_guests(),
        "stats": store.get_stats(),
        "recentEvents": broker.get_recent_events(20),
        "menu": store.get_menu(),
        "technicians": store.get_technicians(),
        "housekeepers": store.get_housekeepers(),
        "settings": store.get_settings(),
        "serverTime": int(time.time() * 1000),
    }
    return sanitize_for_role(payload, session["role"])

@router.get("/events/recent")
def api_events_recent(limit: int = 50, session: dict = Depends(RequirePermission("events.view"))):
    limit = min(max(limit, 1), 200)
    return {"events": broker.get_recent_events(limit)}

@router.get("/broker/topics")
def api_broker_topics(session: dict = Depends(RequirePermission("events.view"))):
    return {"topics": broker.list_topics()}
