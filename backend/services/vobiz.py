import httpx
import logging
from services.settings_service import get_settings

logger = logging.getLogger(__name__)
VOBIZ_API_BASE = "https://api.vobiz.ai/api/v1"


async def initiate_call(to_number: str, answer_url: str, hangup_url: str):
    s = await get_settings()
    auth_id, auth_token, from_number = s["vobiz_auth_id"], s["vobiz_auth_token"], s["vobiz_from_number"]
    if not auth_id or not auth_token or not from_number:
        raise ValueError("Vobiz credentials not configured. Set them in Settings.")
    body = {
        "from": from_number,
        "to": to_number,
        "answer_url": answer_url,
        "answer_method": "POST",
        "hangup_url": hangup_url,
        "hangup_method": "POST",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{VOBIZ_API_BASE}/Account/{auth_id}/Call/",
            json=body,
            headers={"X-Auth-ID": auth_id, "X-Auth-Token": auth_token},
        )
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400:
        logger.error(f"[Vobiz] call error {resp.status_code}: {data}")
        raise ValueError(data.get("error") or data.get("message") or f"Vobiz API returned {resp.status_code}")
    call_uuid = data.get("request_uuid") or data.get("call_uuid") or data.get("uuid") or ""
    logger.info(f"[Vobiz] Outbound call initiated to {to_number}, uuid={call_uuid}")
    return call_uuid, from_number


async def hangup_call(call_uuid: str) -> bool:
    s = await get_settings()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.delete(
                f"{VOBIZ_API_BASE}/Account/{s['vobiz_auth_id']}/Call/{call_uuid}/",
                headers={"X-Auth-ID": s["vobiz_auth_id"], "X-Auth-Token": s["vobiz_auth_token"]},
            )
        return resp.status_code < 400
    except Exception as e:
        logger.error(f"[Vobiz] hangup failed: {e}")
        return False


def stream_xml(ws_url: str, greeting: str = "") -> str:
    speak = f"\n  <Speak>{greeting}</Speak>" if greeting else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>{speak}
  <Stream bidirectional="true" keepCallAlive="true" audioTrack="inbound" contentType="audio/x-l16;rate=16000">
    {ws_url}
  </Stream>
</Response>"""
