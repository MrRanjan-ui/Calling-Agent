from datetime import datetime, timezone, timedelta
from fastapi import APIRouter
from db import db

router = APIRouter()


@router.get("/dashboard/stats")
async def dashboard_stats():
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    total_calls = await db.call_logs.count_documents({})
    completed = await db.call_logs.count_documents({"status": "completed"})
    failed = await db.call_logs.count_documents({"status": "failed"})
    inbound = await db.call_logs.count_documents({"direction": "inbound"})
    outbound = await db.call_logs.count_documents({"direction": "outbound"})
    active = await db.call_logs.count_documents({"status": {"$in": ["ringing", "answered", "in-progress"]}})

    pipeline = [{"$match": {"status": "completed"}},
                {"$group": {"_id": None, "total": {"$sum": "$duration_seconds"}, "avg": {"$avg": "$duration_seconds"}}}]
    agg = await db.call_logs.aggregate(pipeline).to_list(1)
    total_minutes = round((agg[0]["total"] if agg else 0) / 60, 1)
    avg_duration = round(agg[0]["avg"] if agg else 0)

    contacts = await db.contacts.count_documents({})
    campaigns_running = await db.campaigns.count_documents({"status": "running"})
    personas = await db.personas.count_documents({})

    # 7-day daily volume
    daily = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date().isoformat()
        count = await db.call_logs.count_documents({"started_at": {"$gte": day + "T00:00:00", "$lte": day + "T23:59:59.999999+00:00"}})
        daily.append({"date": day[5:], "calls": count})

    lead_counts = {}
    for status in ["new", "contacted", "qualified", "proposal", "won", "lost"]:
        lead_counts[status] = await db.contacts.count_documents({"lead_status": status})

    sentiments = {}
    for s in ["positive", "neutral", "negative"]:
        sentiments[s] = await db.call_logs.count_documents({"sentiment": s})

    recent = await db.call_logs.find({}, {"_id": 0, "transcript": 0, "tool_calls": 0}).sort("started_at", -1).to_list(8)
    callbacks = await db.callbacks.count_documents({"status": "scheduled"})

    return {
        "total_calls": total_calls, "completed": completed, "failed": failed,
        "inbound": inbound, "outbound": outbound, "active_calls": active,
        "total_minutes": total_minutes, "avg_duration_seconds": avg_duration,
        "contacts": contacts, "campaigns_running": campaigns_running, "personas": personas,
        "success_rate": round(completed / total_calls * 100, 1) if total_calls else 0,
        "daily_volume": daily, "lead_counts": lead_counts, "sentiments": sentiments,
        "recent_calls": recent, "pending_callbacks": callbacks,
    }
