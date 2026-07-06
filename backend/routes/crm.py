from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import db
from models import Contact, Pipeline, PipelineStage, Note, gen_id, now_iso

router = APIRouter()


# ── Contacts ──────────────────────────────────────────────
@router.get("/contacts")
async def list_contacts(search: str = "", lead_status: str = "", tag: str = "", limit: int = 500):
    q = {}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"phone": {"$regex": search, "$options": "i"}},
                    {"company": {"$regex": search, "$options": "i"}},
                    {"email": {"$regex": search, "$options": "i"}}]
    if lead_status:
        q["lead_status"] = lead_status
    if tag:
        q["tags"] = tag
    return await db.contacts.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)


@router.get("/contacts/{contact_id}")
async def get_contact(contact_id: str):
    c = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contact not found")
    calls = await db.call_logs.find(
        {"$or": [{"contact_id": contact_id}, {"from_number": c["phone"]}, {"to_number": c["phone"]}]} if c.get("phone")
        else {"contact_id": contact_id},
        {"_id": 0, "transcript": 0, "tool_calls": 0}).sort("started_at", -1).to_list(50)
    c["interactions"] = calls
    return c


@router.post("/contacts")
async def create_contact(contact: Contact):
    await db.contacts.insert_one(contact.model_dump())
    return contact


@router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, patch: dict):
    patch.pop("_id", None)
    patch.pop("id", None)
    patch.pop("interactions", None)
    res = await db.contacts.update_one({"id": contact_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "Contact not found")
    return await db.contacts.find_one({"id": contact_id}, {"_id": 0})


@router.post("/contacts/{contact_id}/notes")
async def add_note(contact_id: str, note: dict):
    n = Note(text=note.get("text", "")).model_dump()
    await db.contacts.update_one({"id": contact_id}, {"$push": {"notes": n}})
    return n


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    await db.contacts.delete_one({"id": contact_id})
    return {"success": True}


# ── Pipelines / Kanban ────────────────────────────────────
@router.get("/pipelines")
async def list_pipelines():
    return await db.pipelines.find({}, {"_id": 0}).sort("created_at", 1).to_list(50)


@router.post("/pipelines")
async def create_pipeline(body: dict):
    stages = [PipelineStage(name=s, order=i).model_dump() for i, s in enumerate(body.get("stages") or ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"])]
    p = Pipeline(name=body.get("name", "Pipeline"), stages=[])
    doc = p.model_dump()
    doc["stages"] = stages
    await db.pipelines.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.put("/pipelines/{pipeline_id}")
async def update_pipeline(pipeline_id: str, patch: dict):
    patch.pop("_id", None)
    patch.pop("id", None)
    await db.pipelines.update_one({"id": pipeline_id}, {"$set": patch})
    return await db.pipelines.find_one({"id": pipeline_id}, {"_id": 0})


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    await db.pipelines.delete_one({"id": pipeline_id})
    return {"success": True}


@router.get("/pipelines/{pipeline_id}/board")
async def kanban_board(pipeline_id: str):
    pipeline = await db.pipelines.find_one({"id": pipeline_id}, {"_id": 0})
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    contacts = await db.contacts.find({"pipeline_id": pipeline_id}, {"_id": 0}).to_list(1000)
    unassigned = await db.contacts.find({"$or": [{"pipeline_id": ""}, {"pipeline_id": {"$exists": False}}]}, {"_id": 0}).to_list(1000)
    board = {"pipeline": pipeline, "columns": [], "unassigned": unassigned}
    for stage in pipeline["stages"]:
        board["columns"].append({"stage": stage, "cards": [c for c in contacts if c.get("stage_id") == stage["id"]]})
    return board


class MoveRequest(BaseModel):
    contact_id: str
    pipeline_id: str
    stage_id: str


@router.post("/pipelines/move")
async def move_card(body: MoveRequest):
    await db.contacts.update_one({"id": body.contact_id}, {"$set": {"pipeline_id": body.pipeline_id, "stage_id": body.stage_id}})
    return {"success": True}


# ── Callbacks queue ───────────────────────────────────────
@router.get("/callbacks")
async def list_callbacks():
    return await db.callbacks.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.put("/callbacks/{cb_id}")
async def update_callback(cb_id: str, patch: dict):
    patch.pop("_id", None)
    await db.callbacks.update_one({"id": cb_id}, {"$set": patch})
    return {"success": True}
