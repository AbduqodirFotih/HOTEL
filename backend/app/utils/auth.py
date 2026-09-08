import hashlib
import secrets
import time
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.logger import logger
import copy

SALT = "hotelos-pdp-2026"

def hash_password(plain):
    return hashlib.sha256((SALT + plain).encode('utf-8')).hexdigest()

USERS = [
    {"username": "admin", "passwordHash": hash_password("admin123"), "role": "manager", "displayName": "Bosh Menejer"},
    {"username": "reception", "passwordHash": hash_password("reception123"), "role": "reception", "displayName": "Qabul Xodimi"},
    {"username": "housekeeping", "passwordHash": hash_password("housekeeping123"), "role": "housekeeping", "displayName": "Tozalash Xodimi"},
    {"username": "maintenance", "passwordHash": hash_password("maintenance123"), "role": "maintenance", "displayName": "Texnik Xodim"},
]

POLICIES = {
    "manager": {
        "role": "manager",
        "displayName": "Bosh Menejer",
        "description": "To'liq nazorat — hamma narsani ko'radi, lekin xodimlar ishini bajarmaydi. Faqat eslatma yuboradi va statistikani kuzatadi.",
        "canSeeFinancials": True,
        "canSeeStaffNames": True,
        "permissions": {
            "reception.inventory",
            "housekeeping.queue.view",
            "orders.view", "orders.menu",
            "maintenance.view",
            "manager.remind_housekeeping",
            "manager.remind_maintenance",
            "manager.force_maintenance",
            "notifications.view", "notifications.modify",
            "settings.view", "settings.update", "settings.reset",
            "tests.run",
            "events.view", "broker.topics",
            "dashboard.view",
            "stats.view",
            "history.view",
        },
        "pages": ["dashboard", "rooms", "reception", "housekeeping", "orders", "maintenance", "tests", "events", "architecture", "settings"],
        "landingPage": "dashboard",
    },
    "reception": {
        "role": "reception",
        "displayName": "Qabul Xodimi",
        "description": "Mehmonlar bilan ishlash: check-in/out, xona xizmati, tozalash buyrug'i, texnik muammo qayd qilish",
        "canSeeFinancials": True,
        "canSeeStaffNames": True,
        "permissions": {
            "reception.checkin", "reception.checkout", "reception.inventory",
            "reception.confirm_available", "reception.mark_needs_cleaning",
            "housekeeping.queue.view", "housekeeping.enqueue",
            "orders.view", "orders.create", "orders.advance", "orders.cancel", "orders.menu",
            "maintenance.view", "maintenance.report",
            "notifications.view", "notifications.modify",
            "settings.view",
            "events.view",
            "dashboard.view",
        },
        "pages": ["dashboard", "rooms", "reception", "orders", "maintenance", "events", "architecture", "settings"],
        "landingPage": "reception",
    },
    "housekeeping": {
        "role": "housekeeping",
        "displayName": "Tozalash Xodimi",
        "description": "Tozalash navbati va xona holatlarini boshqarish. Har 12 soatda barcha xonalarni qayta tozalash.",
        "canSeeFinancials": False,
        "canSeeStaffNames": False,
        "permissions": {
            "reception.inventory",
            "housekeeping.queue.view", "housekeeping.start", "housekeeping.complete", "housekeeping.enqueue",
            "notifications.view", "notifications.modify",
            "settings.view",
            "events.view",
            "dashboard.view",
        },
        "pages": ["dashboard", "rooms", "housekeeping", "events", "architecture", "settings"],
        "landingPage": "housekeeping",
    },
    "maintenance": {
        "role": "maintenance",
        "displayName": "Texnik Xodim",
        "description": "Faqat qabul xodimi qayd qilgan ishlarni ijro etadi. O'zi yangi so'rov yarata olmaydi.",
        "canSeeFinancials": False,
        "canSeeStaffNames": True,
        "permissions": {
            "reception.inventory",
            "maintenance.view", "maintenance.acknowledge", "maintenance.start", "maintenance.resolve",
            "notifications.view", "notifications.modify",
            "settings.view",
            "events.view",
            "dashboard.view",
        },
        "pages": ["dashboard", "rooms", "maintenance", "events", "architecture", "settings"],
        "landingPage": "maintenance",
    },
}

def public_policy(role):
    p = POLICIES.get(role)
    if not p:
        return None
    return {
        "role": p["role"],
        "displayName": p["displayName"],
        "description": p["description"],
        "canSeeFinancials": p["canSeeFinancials"],
        "canSeeStaffNames": p["canSeeStaffNames"],
        "permissions": list(p["permissions"]),
        "pages": p["pages"],
        "landingPage": p["landingPage"],
    }

tokens = {}
TOKEN_TTL_MS = 1000 * 60 * 60 * 8

def generate_token():
    return secrets.token_hex(32)

def login(username, password):
    user = next((u for u in USERS if u["username"] == username), None)
    if not user or user["passwordHash"] != hash_password(password):
        logger.warn(f"[AUTH] Muvaffaqiyatsiz kirish urinishi: {username}")
        return None
    token = generate_token()
    tokens[token] = {
        "username": user["username"],
        "role": user["role"],
        "displayName": user["displayName"],
        "issuedAt": int(time.time() * 1000),
    }
    logger.info(f"[AUTH] Tizimga kirdi: {username} ({user['role']})")
    return {
        "token": token,
        "user": {"username": user["username"], "role": user["role"], "displayName": user["displayName"]},
        "policy": public_policy(user["role"])
    }

def validate_token(token):
    if not token:
        return None
    session = tokens.get(token)
    if not session:
        return None
    if int(time.time() * 1000) - session["issuedAt"] > TOKEN_TTL_MS:
        del tokens[token]
        return None
    return session

def logout(token):
    if token in tokens:
        del tokens[token]
        return True
    return False

security = HTTPBearer(auto_error=False)

def require_auth(credentials: HTTPAuthorizationCredentials = Security(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    token = credentials.credentials
    session = validate_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    return session

def RequirePermission(perm: str):
    def dependency(session: dict = Security(require_auth)):
        role = session["role"]
        policy = POLICIES.get(role)
        if not policy or perm not in policy["permissions"]:
            logger.warn(f"[AUTH] Rad etildi: {session['username']} ({role}) -> {perm}")
            raise HTTPException(status_code=403, detail=f"Sizning rolingiz ({policy['displayName'] if policy else role}) bu amalni bajara olmaydi")
        return session
    return dependency

def sanitize_for_role(data, role):
    policy = POLICIES.get(role)
    if not policy:
        return data
    if policy.get("canSeeFinancials"):
        return data
        
    cleaned = copy.deepcopy(data)
    
    if isinstance(cleaned.get("rooms"), list):
        for r in cleaned["rooms"]:
            r.pop("nightlyRate", None)
            
    def strip_order(o):
        if not o:
            return
        o.pop("total", None)
        if isinstance(o.get("items"), list):
            for i in o["items"]:
                i.pop("unitPrice", None)
                i.pop("lineTotal", None)
                
    if isinstance(cleaned.get("activeOrders"), list):
        for o in cleaned["activeOrders"]:
            strip_order(o)
    if isinstance(cleaned.get("orders"), list):
        for o in cleaned["orders"]:
            strip_order(o)
            
    if isinstance(cleaned.get("menu"), list):
        for m in cleaned["menu"]:
            m.pop("price", None)
            
    if "stats" in cleaned:
        cleaned["stats"].pop("totalRevenue", None)
        
    if isinstance(cleaned.get("guests"), list):
        for g in cleaned["guests"]:
            if isinstance(g.get("extraCharges"), list):
                g["extraCharges"] = []
                
    return cleaned
