from fastapi import APIRouter, HTTPException
from db import db
from models import Persona
from services.tools_registry import BUILTIN_TOOLS

router = APIRouter()

GEMINI_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"]


@router.get("/personas")
async def list_personas():
    return await db.personas.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


@router.get("/personas/meta/options")
async def persona_options():
    custom = await db.custom_tools.find({"enabled": True}, {"_id": 0, "name": 1, "description": 1}).to_list(200)
    return {
        "voices": GEMINI_VOICES,
        "builtin_tools": [{"name": t["name"], "description": t["description"]} for t in BUILTIN_TOOLS],
        "custom_tools": custom,
    }


@router.post("/personas")
async def create_persona(persona: Persona):
    if persona.is_default:
        await db.personas.update_many({}, {"$set": {"is_default": False}})
    await db.personas.insert_one(persona.model_dump())
    return persona


@router.put("/personas/{persona_id}")
async def update_persona(persona_id: str, patch: dict):
    patch.pop("_id", None)
    patch.pop("id", None)
    if patch.get("is_default"):
        await db.personas.update_many({}, {"$set": {"is_default": False}})
    res = await db.personas.update_one({"id": persona_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "Persona not found")
    return await db.personas.find_one({"id": persona_id}, {"_id": 0})


@router.delete("/personas/{persona_id}")
async def delete_persona(persona_id: str):
    await db.personas.delete_one({"id": persona_id})
    return {"success": True}
