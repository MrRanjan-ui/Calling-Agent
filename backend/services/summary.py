import json
import logging
import re
from db import db
from models import gen_id, now_iso
from services.settings_service import get_settings

logger = logging.getLogger(__name__)


async def generate_call_summary(call_id: str):
    try:
        call = await db.call_logs.find_one({"id": call_id}, {"_id": 0})
        if not call or not call.get("transcript"):
            if call:
                await db.call_logs.update_one({"id": call_id}, {"$set": {"summary": "No conversation recorded.", "outcome": "no-conversation"}})
            return
        s = await get_settings()
        if not s.get("gemini_api_key"):
            return
        transcript_text = "\n".join(f"{t['role'].upper()}: {t['text']}" for t in call["transcript"])
        tools_text = ""
        if call.get("tool_calls"):
            tools_text = "\nTools used during call:\n" + "\n".join(
                f"- {tc['name']}({json.dumps(tc.get('args', {}))[:200]})" for tc in call["tool_calls"])
        prompt = f"""Analyze this phone call transcript between an AI agent (AGENT) and a caller (USER).
Return STRICT JSON only (no markdown fences) with these keys:
{{"summary": "concise professional summary with topic, key details and outcome (3-6 sentences)",
"outcome": "one short phrase e.g. 'appointment booked', 'lead qualified', 'not interested', 'callback requested', 'transferred to human', 'incomplete'",
"sentiment": "positive|neutral|negative",
"lead_status_suggestion": "new|contacted|qualified|proposal|won|lost"}}

Transcript:
{transcript_text}
{tools_text}"""
        from google import genai
        client = genai.Client(api_key=s["gemini_api_key"])
        resp = await client.aio.models.generate_content(model=s.get("summary_model", "gemini-2.5-flash"), contents=prompt)
        text = (resp.text or "").strip()
        text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
        try:
            data = json.loads(text)
        except Exception:
            data = {"summary": text[:2000], "outcome": "", "sentiment": "", "lead_status_suggestion": ""}

        await db.call_logs.update_one({"id": call_id}, {"$set": {
            "summary": data.get("summary", ""), "outcome": data.get("outcome", ""),
            "sentiment": data.get("sentiment", "")}})

        # CRM auto-update: attach interaction note to contact
        phone = call.get("from_number") if call["direction"] == "inbound" else call.get("to_number")
        contact = None
        if call.get("contact_id"):
            contact = await db.contacts.find_one({"id": call["contact_id"]}, {"_id": 0})
        if not contact and phone:
            contact = await db.contacts.find_one({"phone": phone}, {"_id": 0})
        if not contact and phone:
            cid = gen_id("con_")
            contact = {"id": cid, "name": phone, "phone": phone, "email": "", "company": "", "avatar": "",
                       "notes": [], "tags": ["auto-created"], "custom_fields": {}, "lifetime_value": 0,
                       "lead_status": "contacted", "pipeline_id": "", "stage_id": "", "last_contacted_at": now_iso(),
                       "total_calls": 0, "created_at": now_iso()}
            await db.contacts.insert_one({**contact})
        if contact:
            note = {"id": gen_id("note_"),
                    "text": f"[Call {call['direction']}] {data.get('outcome') or 'completed'}: {data.get('summary', '')[:400]}",
                    "created_at": now_iso()}
            update = {"$push": {"notes": note}, "$set": {"last_contacted_at": now_iso()}}
            statuses = ["new", "contacted", "qualified", "proposal", "won", "lost"]
            sugg = data.get("lead_status_suggestion", "")
            cur = contact.get("lead_status", "new")
            if sugg in statuses and statuses.index(sugg) > statuses.index(cur if cur in statuses else "new") and cur not in ("won", "lost"):
                update["$set"]["lead_status"] = sugg
            await db.contacts.update_one({"id": contact["id"]}, update)
            await db.call_logs.update_one({"id": call_id}, {"$set": {"contact_id": contact["id"]}})
        logger.info(f"[Summary] Saved summary for {call_id}")
    except Exception as e:
        logger.error(f"[Summary] Failed for {call_id}: {e}")
