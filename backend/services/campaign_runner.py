import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from db import db

logger = logging.getLogger(__name__)

MODE_FACTOR = {"preview": 1, "progressive": 1, "power": 1, "predictive": 2}


def _now():
    return datetime.now(timezone.utc)


def _in_window(campaign) -> bool:
    try:
        tz = ZoneInfo(campaign.get("timezone") or "Asia/Kolkata")
    except Exception:
        tz = ZoneInfo("Asia/Kolkata")
    local = datetime.now(tz).strftime("%H:%M")
    return campaign.get("call_window_start", "00:00") <= local <= campaign.get("call_window_end", "23:59")


async def finalize_campaign_contact(campaign_id: str, campaign_contact_id: str, connected: bool):
    """Called when a campaign call ends (from ws close or hangup webhook)."""
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        return
    cc = next((c for c in campaign["contacts"] if c["id"] == campaign_contact_id), None)
    if not cc or cc["status"] not in ("dialing",):
        return
    if connected:
        new_status = "completed"
        upd = {"contacts.$.status": "completed"}
    else:
        if cc["attempts"] <= campaign.get("max_retries", 0):
            next_at = (_now() + timedelta(minutes=campaign.get("retry_delay_minutes", 15))).isoformat()
            upd = {"contacts.$.status": "retry_scheduled", "contacts.$.next_attempt_at": next_at}
        else:
            upd = {"contacts.$.status": "failed"}
    await db.campaigns.update_one({"id": campaign_id, "contacts.id": campaign_contact_id}, {"$set": upd})


async def _tick():
    now = _now()
    # activate scheduled campaigns
    await db.campaigns.update_many(
        {"status": "scheduled", "scheduled_at": {"$lte": now.isoformat()}},
        {"$set": {"status": "running"}})

    running = await db.campaigns.find({"status": "running"}, {"_id": 0}).to_list(100)
    for c in running:
        try:
            await _process_campaign(c, now)
        except Exception as e:
            logger.error(f"[CampaignRunner] {c['id']} error: {e}")


async def _process_campaign(c, now):
    from services.call_service import start_outbound_call

    contacts = c.get("contacts", [])
    # stale dialing timeout (>4 min without call completing)
    for cc in contacts:
        if cc["status"] == "dialing" and cc.get("dialing_started_at"):
            started = datetime.fromisoformat(cc["dialing_started_at"])
            if (now - started).total_seconds() > 240:
                await finalize_campaign_contact(c["id"], cc["id"], connected=False)

    c = await db.campaigns.find_one({"id": c["id"]}, {"_id": 0})
    contacts = c.get("contacts", [])
    pending = [cc for cc in contacts if cc["status"] == "queued" or
               (cc["status"] == "retry_scheduled" and cc.get("next_attempt_at") and cc["next_attempt_at"] <= now.isoformat())]
    dialing = [cc for cc in contacts if cc["status"] == "dialing"]

    if not pending and not dialing:
        await db.campaigns.update_one({"id": c["id"]}, {"$set": {"status": "completed"}})
        logger.info(f"[CampaignRunner] Campaign {c['name']} completed")
        return

    if not _in_window(c):
        return

    # pacing: minimum gap between dials
    last_dial = c.get("last_dial_at")
    if last_dial and (now - datetime.fromisoformat(last_dial)).total_seconds() < c.get("pacing_seconds", 10):
        return

    capacity = max(1, c.get("max_concurrent", 1)) * MODE_FACTOR.get(c.get("dialing_mode", "power"), 1) - len(dialing)
    if capacity <= 0 or not pending:
        return

    cc = pending[0]
    await db.campaigns.update_one({"id": c["id"], "contacts.id": cc["id"]}, {"$set": {
        "contacts.$.status": "dialing", "contacts.$.dialing_started_at": now.isoformat(),
        "contacts.$.attempts": cc["attempts"] + 1, "last_dial_at": now.isoformat()}})
    try:
        call_id = await start_outbound_call(cc["phone"], c.get("persona_id", ""),
                                            campaign_id=c["id"], campaign_contact_id=cc["id"],
                                            contact_id=cc.get("contact_id", ""))
        await db.campaigns.update_one({"id": c["id"], "contacts.id": cc["id"]},
                                      {"$set": {"contacts.$.last_call_id": call_id}})
        logger.info(f"[CampaignRunner] Dialed {cc['phone']} for campaign {c['name']}")
    except Exception as e:
        logger.error(f"[CampaignRunner] Dial failed for {cc['phone']}: {e}")
        await finalize_campaign_contact(c["id"], cc["id"], connected=False)


async def campaign_loop():
    logger.info("[CampaignRunner] Started")
    while True:
        try:
            await _tick()
        except Exception as e:
            logger.error(f"[CampaignRunner] tick error: {e}")
        await asyncio.sleep(8)
