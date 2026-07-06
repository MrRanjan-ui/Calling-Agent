import httpx
import logging
from datetime import datetime, timezone
from db import db
from models import gen_id, now_iso

logger = logging.getLogger(__name__)


def _score_doc(content: str, query: str) -> int:
    words = [w for w in query.lower().split() if len(w) > 2]
    text = content.lower()
    return sum(text.count(w) for w in words)


async def search_kb(kb_ids: list, query: str):
    q = {"id": {"$in": kb_ids}} if kb_ids else {}
    kbs = await db.knowledge_bases.find(q, {"_id": 0}).to_list(50)
    scored = []
    for kb in kbs:
        for doc in kb.get("documents", []):
            content = doc.get("content", "")
            score = _score_doc(content, query)
            if score > 0:
                scored.append((score, doc["title"], content))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return {"results": "No matching information found in the knowledge base."}
    results = [{"title": t, "content": c[:2500]} for _, t, c in scored[:3]]
    return {"results": results}


class ToolExecutor:
    def __init__(self, call_ctx: dict):
        self.ctx = call_ctx  # {call_id, contact_id, from_number, persona, direction}
        self.end_call_requested = False
        self.transfer_requested = None

    async def execute(self, name: str, args: dict):
        try:
            return await self._dispatch(name, args or {})
        except Exception as e:
            logger.error(f"[ToolExecutor] {name} failed: {e}")
            return {"error": f"Tool '{name}' failed: {str(e)[:200]}"}

    async def _dispatch(self, name, args):
        persona = self.ctx.get("persona") or {}

        if name == "end_call":
            self.end_call_requested = True
            return {"success": True, "message": "Call will end now. Say a brief goodbye."}

        if name == "transfer_to_department":
            self.transfer_requested = args.get("department", "support")
            await db.transfer_requests.insert_one({
                "id": gen_id("tr_"), "call_id": self.ctx.get("call_id"),
                "department": args.get("department"), "reason": args.get("reason", ""),
                "from_number": self.ctx.get("from_number"), "created_at": now_iso(), "status": "pending"})
            return {"success": True, "message": f"Transfer request logged for {args.get('department')} department. Tell the caller a human agent will call them back shortly."}

        if name == "search_knowledge_base":
            return await search_kb(persona.get("knowledge_base_ids", []), args.get("query", ""))

        if name == "update_lead_status":
            contact_id = await self._ensure_contact()
            status = (args.get("status") or "contacted").lower()
            if status not in ["new", "contacted", "qualified", "proposal", "won", "lost"]:
                status = "contacted"
            update = {"lead_status": status}
            await db.contacts.update_one({"id": contact_id}, {"$set": update})
            if args.get("note"):
                await db.contacts.update_one({"id": contact_id}, {"$push": {"notes": {
                    "id": gen_id("note_"), "text": f"[AI] {args['note']}", "created_at": now_iso()}}})
            return {"success": True, "status": status}

        if name == "add_contact_note":
            contact_id = await self._ensure_contact()
            await db.contacts.update_one({"id": contact_id}, {"$push": {"notes": {
                "id": gen_id("note_"), "text": f"[AI] {args.get('note', '')}", "created_at": now_iso()}}})
            return {"success": True}

        if name == "schedule_callback":
            contact_id = await self._ensure_contact()
            await db.callbacks.insert_one({
                "id": gen_id("cb_"), "contact_id": contact_id,
                "phone": self.ctx.get("from_number"), "datetime": args.get("datetime"),
                "topic": args.get("topic", ""), "status": "scheduled",
                "persona_id": persona.get("id", ""), "created_at": now_iso()})
            return {"success": True, "message": f"Callback scheduled for {args.get('datetime')}"}

        if name == "create_calendar_event":
            from services.google_calendar import create_event
            return await create_event(args.get("summary"), args.get("start_time"),
                                      args.get("end_time"), args.get("description", ""))

        if name == "list_calendar_events":
            from services.google_calendar import list_events
            return await list_events(args.get("max_results", 5))

        # Custom n8n webhook tool
        tool = await db.custom_tools.find_one({"name": name, "enabled": True}, {"_id": 0})
        if tool:
            payload = {**args, "_call_context": {
                "call_id": self.ctx.get("call_id"), "caller_number": self.ctx.get("from_number"),
                "persona": persona.get("name", ""), "direction": self.ctx.get("direction", "")}}
            async with httpx.AsyncClient(timeout=25) as client:
                if tool.get("method", "POST").upper() == "GET":
                    resp = await client.get(tool["webhook_url"], params=args)
                else:
                    resp = await client.post(tool["webhook_url"], json=payload)
            try:
                data = resp.json()
            except Exception:
                data = {"output": resp.text[:2000]}
            if isinstance(data, list):
                data = {"output": data}
            return data if isinstance(data, dict) else {"output": str(data)[:2000]}

        return {"error": f"Tool '{name}' is not configured."}

    async def _ensure_contact(self):
        if self.ctx.get("contact_id"):
            return self.ctx["contact_id"]
        phone = self.ctx.get("from_number", "")
        existing = await db.contacts.find_one({"phone": phone}, {"_id": 0}) if phone else None
        if existing:
            self.ctx["contact_id"] = existing["id"]
            return existing["id"]
        cid = gen_id("con_")
        await db.contacts.insert_one({
            "id": cid, "name": phone or "Unknown Caller", "phone": phone, "email": "", "company": "",
            "avatar": "", "notes": [], "tags": ["auto-created"], "custom_fields": {}, "lifetime_value": 0,
            "lead_status": "new", "pipeline_id": "", "stage_id": "", "last_contacted_at": now_iso(),
            "total_calls": 0, "created_at": now_iso()})
        self.ctx["contact_id"] = cid
        return cid
