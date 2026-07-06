import logging
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from db import db
from models import CallLog
from services import vobiz
from services.call_service import start_outbound_call, resolve_persona, hangup_call_by_id, PUBLIC_BASE_URL, ws_base
from services.settings_service import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.api_route("/telephony/inbound", methods=["GET", "POST"])
async def inbound_call(request: Request):
    params = dict(request.query_params)
    form = {}
    try:
        form = dict(await request.form())
    except Exception:
        pass
    from_number = form.get("From") or params.get("From") or params.get("caller") or ""
    persona = await resolve_persona(params.get("persona_id", ""))
    settings = await get_settings()

    if not from_number:
        return Response(content=vobiz.stream_xml(""), media_type="text/xml")

    log = CallLog(persona_id=(persona or {}).get("id", ""), persona_name=(persona or {}).get("name", ""),
                  direction="inbound", from_number=from_number, status="ringing")
    await db.call_logs.insert_one(log.model_dump())
    logger.info(f"[Telephony] Inbound call from {from_number} -> persona {(persona or {}).get('name')}")

    ws_url = f"{ws_base()}/api/telephony/stream?call_id={log.id}&persona_id={(persona or {}).get('id', '')}&direction=inbound&from_number={from_number}"
    greeting = "Please wait while we connect you." if settings.get("inbound_greeting_enabled") else ""
    return Response(content=vobiz.stream_xml(ws_url, greeting), media_type="text/xml")


@router.api_route("/telephony/outbound-answer", methods=["GET", "POST"])
async def outbound_answer(request: Request):
    params = dict(request.query_params)
    call_id = params.get("call_id", "")
    persona_id = params.get("persona_id", "")
    logger.info(f"[Telephony] Outbound answered: call {call_id}")
    await db.call_logs.update_one({"id": call_id}, {"$set": {"status": "answered"}})
    ws_url = f"{ws_base()}/api/telephony/stream?call_id={call_id}&persona_id={persona_id}&direction=outbound"
    return Response(content=vobiz.stream_xml(ws_url), media_type="text/xml")


@router.api_route("/telephony/hangup", methods=["GET", "POST"])
async def hangup_webhook(request: Request):
    params = dict(request.query_params)
    call_id = params.get("call_id", "")
    if call_id:
        call = await db.call_logs.find_one({"id": call_id}, {"_id": 0})
        if call and call.get("status") in ("initiated", "ringing", "answered"):
            from models import now_iso
            await db.call_logs.update_one({"id": call_id}, {"$set": {"status": "failed", "error": "no-answer", "ended_at": now_iso()}})
            if call.get("campaign_id") and call.get("campaign_contact_id"):
                from services.campaign_runner import finalize_campaign_contact
                await finalize_campaign_contact(call["campaign_id"], call["campaign_contact_id"], connected=False)
    return {"success": True}


class OutboundRequest(BaseModel):
    to_number: str
    persona_id: str = ""
    contact_id: str = ""


@router.post("/calls/outbound")
async def make_outbound_call(body: OutboundRequest):
    call_id = await start_outbound_call(body.to_number, body.persona_id, contact_id=body.contact_id)
    return {"success": True, "call_id": call_id}


@router.post("/calls/{call_id}/hangup")
async def hangup(call_id: str):
    ok = await hangup_call_by_id(call_id)
    return {"success": ok}
