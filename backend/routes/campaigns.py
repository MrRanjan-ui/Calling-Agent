from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from db import db
from models import Campaign, CampaignContact, now_iso

router = APIRouter()


class CampaignCreate(BaseModel):
    name: str
    persona_id: str = ""
    dialing_mode: str = "power"
    max_concurrent: int = 1
    pacing_seconds: int = 10
    max_retries: int = 2
    retry_delay_minutes: int = 15
    call_window_start: str = "09:00"
    call_window_end: str = "21:00"
    timezone: str = "Asia/Kolkata"
    scheduled_at: Optional[str] = None
    contacts: List[dict] = []  # [{name, phone, contact_id}]


def _stats(c):
    counts = {"queued": 0, "dialing": 0, "completed": 0, "failed": 0, "retry_scheduled": 0}
    for cc in c.get("contacts", []):
        counts[cc["status"]] = counts.get(cc["status"], 0) + 1
    c["stats"] = {**counts, "total": len(c.get("contacts", []))}
    return c


@router.get("/campaigns")
async def list_campaigns():
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_stats(c) for c in campaigns]


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str):
    c = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campaign not found")
    return _stats(c)


@router.post("/campaigns")
async def create_campaign(body: CampaignCreate):
    contacts = [CampaignContact(name=c.get("name", ""), phone=str(c.get("phone", "")).strip(),
                                contact_id=c.get("contact_id", "")).model_dump()
                for c in body.contacts if str(c.get("phone", "")).strip()]
    camp = Campaign(**{**body.model_dump(exclude={"contacts"}), "contacts": []})
    doc = camp.model_dump()
    doc["contacts"] = contacts
    if body.scheduled_at:
        doc["status"] = "scheduled"
    await db.campaigns.insert_one({**doc})
    doc.pop("_id", None)
    return _stats(doc)


@router.post("/campaigns/{campaign_id}/start")
async def start_campaign(campaign_id: str):
    res = await db.campaigns.update_one({"id": campaign_id}, {"$set": {"status": "running"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Campaign not found")
    return {"success": True, "status": "running"}


@router.post("/campaigns/{campaign_id}/pause")
async def pause_campaign(campaign_id: str):
    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"status": "paused"}})
    return {"success": True, "status": "paused"}


@router.put("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, patch: dict):
    patch.pop("_id", None)
    patch.pop("id", None)
    patch.pop("contacts", None)
    await db.campaigns.update_one({"id": campaign_id}, {"$set": patch})
    return await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str):
    await db.campaigns.delete_one({"id": campaign_id})
    return {"success": True}
