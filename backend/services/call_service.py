import os
import logging
from datetime import datetime, timezone
from db import db
from models import CallLog
from services import vobiz
from services.settings_service import get_settings

logger = logging.getLogger(__name__)

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")


def ws_base():
    return PUBLIC_BASE_URL.replace("https:", "wss:").replace("http:", "ws:")


async def resolve_persona(persona_id: str = ""):
    p = None
    if persona_id:
        p = await db.personas.find_one({"id": persona_id}, {"_id": 0})
    if not p:
        s = await get_settings()
        if s.get("default_inbound_persona_id"):
            p = await db.personas.find_one({"id": s["default_inbound_persona_id"]}, {"_id": 0})
    if not p:
        p = await db.personas.find_one({"is_default": True}, {"_id": 0})
    if not p:
        p = await db.personas.find_one({}, {"_id": 0})
    return p


async def start_outbound_call(to_number: str, persona_id: str, campaign_id: str = "", campaign_contact_id: str = "", contact_id: str = ""):
    persona = await resolve_persona(persona_id)
    if not persona:
        raise ValueError("No persona configured")
    if not contact_id:
        existing = await db.contacts.find_one({"phone": to_number}, {"_id": 0, "id": 1})
        if existing:
            contact_id = existing["id"]

    log = CallLog(persona_id=persona["id"], persona_name=persona["name"], direction="outbound",
                  to_number=to_number, status="initiated", campaign_id=campaign_id, contact_id=contact_id)
    doc = log.model_dump()
    doc["campaign_contact_id"] = campaign_contact_id
    await db.call_logs.insert_one({**doc})

    answer_url = f"{PUBLIC_BASE_URL}/api/telephony/outbound-answer?call_id={log.id}&persona_id={persona['id']}"
    hangup_url = f"{PUBLIC_BASE_URL}/api/telephony/hangup?call_id={log.id}"
    try:
        call_uuid, from_number = await vobiz.initiate_call(to_number, answer_url, hangup_url)
        await db.call_logs.update_one({"id": log.id}, {"$set": {"call_uuid": call_uuid, "from_number": from_number, "status": "ringing"}})
    except Exception as e:
        await db.call_logs.update_one({"id": log.id}, {"$set": {"status": "failed", "error": str(e), "ended_at": datetime.now(timezone.utc).isoformat()}})
        raise
    return log.id


async def hangup_call_by_id(call_id: str):
    call = await db.call_logs.find_one({"id": call_id}, {"_id": 0})
    if not call:
        return False
    if call.get("call_uuid"):
        await vobiz.hangup_call(call["call_uuid"])
    return True
