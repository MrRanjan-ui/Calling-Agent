import httpx
import logging
from datetime import datetime, timezone
from db import db
from services.settings_service import get_settings

logger = logging.getLogger(__name__)


async def _get_access_token():
    tok = await db.google_tokens.find_one({"id": "primary"}, {"_id": 0})
    if not tok:
        return None
    exp = tok.get("expiry", 0)
    if exp and exp > datetime.now(timezone.utc).timestamp() + 60:
        return tok["access_token"]
    s = await get_settings()
    if not tok.get("refresh_token"):
        return tok.get("access_token")
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": s["google_client_id"],
            "client_secret": s["google_client_secret"],
            "refresh_token": tok["refresh_token"],
            "grant_type": "refresh_token",
        })
    if resp.status_code >= 400:
        logger.error(f"[Google] token refresh failed: {resp.text}")
        return None
    data = resp.json()
    await db.google_tokens.update_one({"id": "primary"}, {"$set": {
        "access_token": data["access_token"],
        "expiry": datetime.now(timezone.utc).timestamp() + data.get("expires_in", 3600),
    }})
    return data["access_token"]


async def create_event(summary, start_time, end_time, description=""):
    token = await _get_access_token()
    if not token:
        return {"error": "Google Calendar not connected. Connect it in Settings."}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            json={"summary": summary, "description": description,
                  "start": {"dateTime": start_time}, "end": {"dateTime": end_time}},
        )
    if resp.status_code >= 400:
        return {"error": f"Calendar API error: {resp.text[:200]}"}
    d = resp.json()
    return {"success": True, "event_id": d.get("id"), "link": d.get("htmlLink")}


async def list_events(max_results=5):
    token = await _get_access_token()
    if not token:
        return {"error": "Google Calendar not connected. Connect it in Settings."}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            params={"timeMin": datetime.now(timezone.utc).isoformat(),
                    "maxResults": max_results, "singleEvents": "true", "orderBy": "startTime"},
        )
    if resp.status_code >= 400:
        return {"error": f"Calendar API error: {resp.text[:200]}"}
    events = [{"summary": e.get("summary"), "start": (e.get("start") or {}).get("dateTime") or (e.get("start") or {}).get("date"),
               "end": (e.get("end") or {}).get("dateTime") or (e.get("end") or {}).get("date")}
              for e in resp.json().get("items", [])]
    return {"events": events}
