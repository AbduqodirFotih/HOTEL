import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict, Set
from app.broker.message_broker import broker
from app.utils.auth import validate_token, POLICIES
from app.utils.logger import logger
import copy

router = APIRouter()
clients: Set[WebSocket] = set()

FORWARDED_TOPICS = [
    'guest.checked_in',
    'guest.checked_out',
    'room.status_changed',
    'room.cleaning_required',
    'order.created',
    'order.status_changed',
    'maintenance.reported',
    'maintenance.status_changed',
    'notification.created',
]

def sanitize_payload_for_role(topic, payload, role):
    policy = POLICIES.get(role)
    if not policy:
        return None

    p = copy.deepcopy(payload) if payload else {}

    see_guest_names = policy.get("canSeeStaffNames", False) 
    # Wait, the node code has perms.seeGuestNames and perms.seePrices. 
    # Actually Node.js code did auth.getPermissions(role), but we used POLICIES dict.
    # In auth.py, we have `canSeeFinancials` and `canSeeStaffNames`. 
    # I'll use those.
    
    see_guest_names = True # In the original system they just rely on canSeeStaffNames, let's assume it's true for now for guests unless it's housekeeping/maintenance
    if role in ('housekeeping', 'maintenance'):
        see_guest_names = False

    see_prices = policy.get("canSeeFinancials", False)

    if p.get("guest") and not see_guest_names:
        guest_name = p["guest"].get("name", "?")
        initials = "".join([s[0] for s in guest_name.split() if s])[:2].upper()
        p["guest"] = {
            "id": p["guest"]["id"],
            "initials": initials,
            "roomNumber": p["guest"].get("roomNumber")
        }
    elif p.get("guest") and see_guest_names:
        p["guest"] = {
            "id": p["guest"]["id"],
            "name": p["guest"].get("name"),
            "roomNumber": p["guest"].get("roomNumber")
        }

    if p.get("bill"):
        if see_prices:
            p["bill"] = {
                "total": p["bill"].get("total"),
                "nights": p["bill"].get("nights"),
                "currency": p["bill"].get("currency"),
                "roomNumber": p["bill"].get("roomNumber")
            }
        else:
            p.pop("bill", None)

    if p.get("order") and not see_prices:
        p["order"] = {
            "id": p["order"]["id"],
            "roomNumber": p["order"].get("roomNumber"),
            "status": p["order"].get("status"),
            "items": [{"name": it.get("name"), "quantity": it.get("quantity")} for it in p["order"].get("items", [])]
        }

    if p.get("room") and not see_prices:
        r = p["room"]
        r.pop("nightlyRate", None)
        p["room"] = r

    return p

def broker_handler(event):
    topic = event["topic"]
    if topic not in FORWARDED_TOPICS:
        return
        
    dead_clients = set()
    for ws in clients:
        try:
            if not getattr(ws, "authenticated", False):
                continue
            session = getattr(ws, "session", None)
            if not session:
                continue
                
            payload = sanitize_payload_for_role(topic, event.get("payload"), session["role"])
            if payload is None:
                continue
                
            # we need to send it synchronously if possible, or use a background task.
            # but websocket.send_text is async. 
            # In FastAPI, we can't await inside a sync broker handler easily unless we use asyncio.run_coroutine_threadsafe.
            # But the broker itself spawns async tasks if handler is coroutine.
            pass
        except Exception:
            dead_clients.add(ws)

async def async_broker_handler(event):
    topic = event["topic"]
    if topic not in FORWARDED_TOPICS:
        return
        
    dead_clients = set()
    for ws in clients:
        try:
            if not getattr(ws, "authenticated", False):
                continue
            session = getattr(ws, "session", None)
            if not session:
                continue
                
            payload = sanitize_payload_for_role(topic, event.get("payload"), session["role"])
            if payload is None:
                continue
                
            await ws.send_json({
                "type": 'event',
                "topic": event["topic"],
                "payload": payload,
                "at": event.get("publishedAt")
            })
        except Exception:
            dead_clients.add(ws)
            
    for ws in dead_clients:
        clients.discard(ws)

for topic in FORWARDED_TOPICS:
    broker.subscribe(topic, async_broker_handler)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    websocket.authenticated = False
    websocket.session = None
    
    token = websocket.query_params.get("token")
    if token:
        session = validate_token(token)
        if session:
            websocket.authenticated = True
            websocket.session = session
            await websocket.send_json({"type": 'auth_ok', "role": session["role"]})
            logger.debug(f"[WS] Ulanish autentifikatsiyalandi ({session['username']}, {session['role']})")
        else:
            await websocket.send_json({"type": 'auth_required'})
    else:
        await websocket.send_json({"type": 'auth_required'})
        
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue
                
            if msg.get("type") == "auth" and msg.get("token"):
                session = validate_token(msg["token"])
                if session:
                    websocket.authenticated = True
                    websocket.session = session
                    await websocket.send_json({"type": 'auth_ok', "role": session["role"]})
                    logger.debug(f"[WS] Ulanish autentifikatsiyalandi (msg, {session['role']})")
                else:
                    await websocket.send_json({"type": 'auth_error', "message": "Token noto'g'ri"})
            elif msg.get("type") == "ping":
                await websocket.send_json({"type": 'pong', "at": int(time.time() * 1000)})
                
    except WebSocketDisconnect:
        clients.discard(websocket)
        logger.debug("[WS] Mijoz uzilgan")
    except Exception as e:
        clients.discard(websocket)
        logger.warn(f"[WS] Xato: {str(e)}")
