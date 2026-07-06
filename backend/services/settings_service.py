import os
from db import db

DEFAULTS = {
    "id": "global",
    "brand_name": "VoxFlow",
    "brand_tagline": "AI Call Automation Platform",
    "vobiz_auth_id": os.environ.get("VOBIZ_AUTH_ID", ""),
    "vobiz_auth_token": os.environ.get("VOBIZ_AUTH_TOKEN", ""),
    "vobiz_from_number": os.environ.get("VOBIZ_FROM_NUMBER", ""),
    "gemini_api_key": os.environ.get("GEMINI_API_KEY", ""),
    "gemini_model": "gemini-3.1-flash-live-preview",
    "summary_model": "gemini-2.5-flash",
    "default_inbound_persona_id": "",
    "inbound_greeting_enabled": True,
    "timezone": "Asia/Kolkata",
    "google_client_id": "",
    "google_client_secret": "",
    "google_connected": False,
}


async def get_settings():
    doc = await db.settings.find_one({"id": "global"}, {"_id": 0})
    if not doc:
        await db.settings.insert_one({**DEFAULTS})
        return dict(DEFAULTS)
    merged = {**DEFAULTS, **doc}
    return merged


async def update_settings(patch: dict):
    patch.pop("id", None)
    await db.settings.update_one({"id": "global"}, {"$set": patch}, upsert=True)
    return await get_settings()
