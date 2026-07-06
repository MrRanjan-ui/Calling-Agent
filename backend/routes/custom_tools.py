import re
import httpx
from fastapi import APIRouter, HTTPException
from db import db
from models import CustomTool

router = APIRouter()


def _validate_name(name: str):
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]{1,60}$", name):
        raise HTTPException(400, "Tool name must be snake_case alphanumeric (e.g. check_order_status)")


@router.get("/tools")
async def list_tools():
    return await db.custom_tools.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/tools")
async def create_tool(tool: CustomTool):
    _validate_name(tool.name)
    existing = await db.custom_tools.find_one({"name": tool.name})
    if existing:
        raise HTTPException(400, "A tool with this name already exists")
    await db.custom_tools.insert_one(tool.model_dump())
    return tool


@router.put("/tools/{tool_id}")
async def update_tool(tool_id: str, patch: dict):
    patch.pop("_id", None)
    patch.pop("id", None)
    if "name" in patch:
        _validate_name(patch["name"])
    await db.custom_tools.update_one({"id": tool_id}, {"$set": patch})
    return await db.custom_tools.find_one({"id": tool_id}, {"_id": 0})


@router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str):
    await db.custom_tools.delete_one({"id": tool_id})
    return {"success": True}


@router.post("/tools/{tool_id}/test")
async def test_tool(tool_id: str, body: dict):
    tool = await db.custom_tools.find_one({"id": tool_id}, {"_id": 0})
    if not tool:
        raise HTTPException(404, "Tool not found")
    args = body.get("args", {})
    payload = {**args, "_call_context": {"call_id": "test", "caller_number": "+910000000000",
                                         "persona": "Test", "direction": "test"}}
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            if tool.get("method", "POST").upper() == "GET":
                resp = await client.get(tool["webhook_url"], params=args)
            else:
                resp = await client.post(tool["webhook_url"], json=payload)
        try:
            data = resp.json()
        except Exception:
            data = resp.text[:2000]
        return {"status_code": resp.status_code, "response": data}
    except Exception as e:
        return {"status_code": 0, "error": str(e)}
