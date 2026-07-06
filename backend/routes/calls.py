from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from db import db

router = APIRouter()
RECORDINGS_DIR = Path(__file__).parent.parent / "recordings"


@router.get("/calls")
async def list_calls(status: str = "", direction: str = "", campaign_id: str = "", contact_id: str = "", limit: int = 100):
    q = {}
    if status:
        q["status"] = status
    if direction:
        q["direction"] = direction
    if campaign_id:
        q["campaign_id"] = campaign_id
    if contact_id:
        q["contact_id"] = contact_id
    calls = await db.call_logs.find(q, {"_id": 0, "transcript": 0, "tool_calls": 0}).sort("started_at", -1).to_list(limit)
    return calls


@router.get("/calls/{call_id}")
async def get_call(call_id: str):
    call = await db.call_logs.find_one({"id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(404, "Call not found")
    return call


@router.get("/calls/{call_id}/recording")
async def get_recording(call_id: str):
    path = RECORDINGS_DIR / f"{call_id}.wav"
    if not path.exists():
        raise HTTPException(404, "Recording not found")
    return FileResponse(str(path), media_type="audio/wav", filename=f"{call_id}.wav")


@router.delete("/calls/{call_id}")
async def delete_call(call_id: str):
    await db.call_logs.delete_one({"id": call_id})
    path = RECORDINGS_DIR / f"{call_id}.wav"
    if path.exists():
        path.unlink()
    return {"success": True}
