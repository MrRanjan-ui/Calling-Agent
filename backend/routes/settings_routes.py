import httpx
from datetime import datetime, timezone
from urllib.parse import urlencode
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from db import db
from services.settings_service import get_settings, update_settings
from services.call_service import PUBLIC_BASE_URL

router = APIRouter()

SENSITIVE = ["vobiz_auth_token", "gemini_api_key", "google_client_secret"]


def _mask(s):
    out = dict(s)
    for k in SENSITIVE:
        v = out.get(k) or ""
        out[k] = (v[:4] + "•" * 8 + v[-4:]) if len(v) > 10 else ("SET" if v else "")
        out[f"{k}_set"] = bool(v)
    return out


@router.get("/settings")
async def read_settings():
    return _mask(await get_settings())


@router.put("/settings")
async def write_settings(patch: dict):
    patch.pop("_id", None)
    current = await get_settings()
    for k in SENSITIVE:
        if k in patch and ("•" in str(patch[k]) or patch[k] in ("SET", "")):
            patch[k] = current.get(k, "")
    for k in list(patch.keys()):
        if k.endswith("_set"):
            patch.pop(k)
    return _mask(await update_settings(patch))


@router.get("/settings/webhook-info")
async def webhook_info():
    return {
        "inbound_answer_url": f"{PUBLIC_BASE_URL}/api/telephony/inbound",
        "hangup_url": f"{PUBLIC_BASE_URL}/api/telephony/hangup",
        "note": "Configure these URLs in your Vobiz number settings (answer_url method POST).",
    }


# ── Google Calendar OAuth ─────────────────────────────────
@router.get("/google/auth-url")
async def google_auth_url():
    s = await get_settings()
    if not s.get("google_client_id"):
        return {"error": "Set Google Client ID & Secret in settings first"}
    redirect_uri = f"{PUBLIC_BASE_URL}/api/google/callback"
    params = {
        "client_id": s["google_client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar",
        "access_type": "offline",
        "prompt": "consent",
    }
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"}


@router.get("/google/callback")
async def google_callback(code: str = ""):
    s = await get_settings()
    redirect_uri = f"{PUBLIC_BASE_URL}/api/google/callback"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": s["google_client_id"], "client_secret": s["google_client_secret"],
            "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
    if resp.status_code >= 400:
        return RedirectResponse(f"{PUBLIC_BASE_URL}/settings?google=error")
    data = resp.json()
    await db.google_tokens.update_one({"id": "primary"}, {"$set": {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token", ""),
        "expiry": datetime.now(timezone.utc).timestamp() + data.get("expires_in", 3600),
    }}, upsert=True)
    await update_settings({"google_connected": True})
    return RedirectResponse(f"{PUBLIC_BASE_URL}/settings?google=connected")


@router.post("/google/disconnect")
async def google_disconnect():
    await db.google_tokens.delete_one({"id": "primary"})
    await update_settings({"google_connected": False})
    return {"success": True}
