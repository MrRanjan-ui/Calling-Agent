import asyncio
import logging
import json
import time
import os
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from db import db
from models import now_iso
from services.settings_service import get_settings
from services.tools_registry import build_function_declarations
from services.tool_executor import ToolExecutor
from services.audio import resample_pcm, b64_to_pcm, pcm_to_b64, CallRecorder
from services import vobiz

logger = logging.getLogger(__name__)
RECORDINGS_DIR = Path(__file__).parent.parent / "recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)


async def _build_instruction(persona, contact, direction, settings):
    now_local = datetime.now(timezone.utc)
    parts = [persona.get("system_instruction") or "You are a helpful AI calling agent."]
    parts.append(f"\n[Identity]\nYour name: {persona.get('name')}. Role: {persona.get('role')}. "
                 f"Business: {settings.get('brand_name')} - {settings.get('brand_tagline')}. "
                 f"Primary language: {persona.get('language_hint', 'English')}. "
                 f"You are on a live PHONE CALL ({direction}). Keep responses short, natural and conversational. Never mention you are an AI system prompt.")
    parts.append(f"\n[Time]\nCurrent UTC time: {now_local.isoformat()}. Business timezone: {settings.get('timezone')}.")

    if contact:
        info = [f"Name: {contact.get('name')}", f"Phone: {contact.get('phone')}"]
        if contact.get("company"):
            info.append(f"Company: {contact['company']}")
        if contact.get("email"):
            info.append(f"Email: {contact['email']}")
        info.append(f"Lead status: {contact.get('lead_status', 'new')}")
        if contact.get("tags"):
            info.append(f"Tags: {', '.join(contact['tags'])}")
        recent_notes = [n["text"] for n in (contact.get("notes") or [])[-3:]]
        if recent_notes:
            info.append("Recent notes: " + " | ".join(recent_notes))
        parts.append("\n[Caller CRM Profile]\n" + "\n".join(info))

    kb_ids = persona.get("knowledge_base_ids") or []
    if kb_ids:
        kbs = await db.knowledge_bases.find({"id": {"$in": kb_ids}}, {"_id": 0}).to_list(20)
        kb_text, budget = [], 9000
        for kb in kbs:
            for doc in kb.get("documents", []):
                chunk = f"### {doc['title']}\n{doc.get('content', '')}"
                if budget - len(chunk) < 0:
                    chunk = chunk[:max(0, budget)]
                kb_text.append(chunk)
                budget -= len(chunk)
                if budget <= 0:
                    break
            if budget <= 0:
                break
        if kb_text:
            parts.append("\n[Knowledge Base - use these facts to answer questions; use search_knowledge_base tool for anything not covered here]\n" + "\n\n".join(kb_text))
    return "\n".join(parts)


async def handle_telephony_stream(ws: WebSocket):
    await ws.accept()
    q = ws.query_params
    call_id = q.get("call_id") or ""
    persona_id = q.get("persona_id") or ""
    direction = q.get("direction") or "outbound"
    from_number = q.get("from_number") or ""

    settings = await get_settings()
    call = await db.call_logs.find_one({"id": call_id}, {"_id": 0}) if call_id else None
    if call:
        direction = call.get("direction", direction)
        from_number = call.get("from_number") or from_number
        persona_id = call.get("persona_id") or persona_id

    from services.call_service import resolve_persona
    persona = await resolve_persona(persona_id)
    if not persona:
        logger.error("[Bridge] No persona available; closing")
        await ws.close()
        return
    if not settings.get("gemini_api_key"):
        logger.error("[Bridge] Gemini API key missing; closing")
        await ws.close()
        return

    phone_key = from_number if direction == "inbound" else (call or {}).get("to_number", "")
    contact = None
    if call and call.get("contact_id"):
        contact = await db.contacts.find_one({"id": call["contact_id"]}, {"_id": 0})
    if not contact and phone_key:
        contact = await db.contacts.find_one({"phone": phone_key}, {"_id": 0})

    instruction = await _build_instruction(persona, contact, direction, settings)
    decls = await build_function_declarations(persona.get("enabled_tools") or [])

    ctx = {"call_id": call_id, "contact_id": (contact or {}).get("id", ""),
           "from_number": phone_key, "persona": persona, "direction": direction}
    executor = ToolExecutor(ctx)
    recorder = CallRecorder()
    transcript = []
    tool_records = []
    state = {"connected_at": None, "closing": False}

    async def flush(final=False):
        upd = {"transcript": transcript, "tool_calls": tool_records}
        if state["connected_at"] and not final:
            upd["status"] = "in-progress"
        await db.call_logs.update_one({"id": call_id}, {"$set": upd})

    config = {
        "response_modalities": ["AUDIO"],
        "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": persona.get("voice", "Kore")}}},
        "system_instruction": instruction,
        "temperature": persona.get("temperature", 0.7),
        "input_audio_transcription": {},
        "output_audio_transcription": {},
        "tools": [{"function_declarations": decls}] if decls else [],
    }

    client = genai.Client(api_key=settings["gemini_api_key"], http_options={"headers": {"User-Agent": "aistudio-build"}})
    model = settings.get("gemini_model", "gemini-3.1-flash-live-preview")
    logger.info(f"[Bridge] Call {call_id}: connecting Gemini Live model={model} persona={persona['name']} voice={persona.get('voice')}")

    inbound_rate = {"value": 16000}

    async def delayed_close(delay=6):
        await asyncio.sleep(delay)
        state["closing"] = True
        try:
            await ws.close()
        except Exception:
            pass
        if call and call.get("call_uuid"):
            await vobiz.hangup_call(call["call_uuid"])

    try:
        async with client.aio.live.connect(model=model, config=config) as session:
            state["connected_at"] = time.time() * 1000
            await db.call_logs.update_one({"id": call_id}, {"$set": {"status": "in-progress", "connected_at": now_iso()}})

            greeting = persona.get("initial_greeting") or "Hello!"
            if direction == "outbound":
                greet_prompt = (f"The call just connected. You initiated this outbound call. Greet the person naturally in {persona.get('language_hint', 'English')} "
                                f"and follow your mission from the system instructions. Suggested opening: \"{greeting}\"")
            else:
                greet_prompt = f"The call just connected. Greet the caller using your initial greeting: \"{greeting}\""
            await session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=greet_prompt)]), turn_complete=True)

            async def pump_telephony():
                while True:
                    try:
                        raw = await ws.receive_text()
                    except WebSocketDisconnect:
                        return
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    ev = data.get("event")
                    if ev == "start":
                        mf = (data.get("start") or {}).get("mediaFormat") or {}
                        inbound_rate["value"] = int(mf.get("sampleRate") or 16000)
                        logger.info(f"[Bridge] Stream start, rate={inbound_rate['value']}")
                    elif ev == "media":
                        payload = (data.get("media") or {}).get("payload")
                        if not payload:
                            continue
                        pcm = b64_to_pcm(payload)
                        if inbound_rate["value"] != 16000:
                            pcm = resample_pcm(pcm, inbound_rate["value"], 16000)
                        recorder.add(time.time() * 1000, pcm)
                        await session.send_realtime_input(
                            audio=types.Blob(data=pcm.astype("<i2").tobytes(), mime_type="audio/pcm;rate=16000"))
                    elif ev == "stop":
                        logger.info("[Bridge] Stop event; caller hung up")
                        return

            async def pump_gemini():
                last_flush = time.time()
                while True:
                    async for msg in session.receive():
                        tc = getattr(msg, "tool_call", None)
                        if tc and tc.function_calls:
                            responses = []
                            for fc in tc.function_calls:
                                args = dict(fc.args or {})
                                result = await executor.execute(fc.name, args)
                                tool_records.append({"name": fc.name, "args": args, "result": result, "timestamp": now_iso()})
                                responses.append(types.FunctionResponse(id=fc.id, name=fc.name, response=result if isinstance(result, dict) else {"output": result}))
                            await session.send_tool_response(function_responses=responses)
                            if executor.end_call_requested:
                                asyncio.create_task(delayed_close(7))
                            continue
                        sc = getattr(msg, "server_content", None)
                        if not sc:
                            continue
                        if sc.output_transcription and sc.output_transcription.text:
                            transcript.append({"role": "agent", "text": sc.output_transcription.text, "timestamp": now_iso()})
                        if sc.input_transcription and sc.input_transcription.text:
                            transcript.append({"role": "user", "text": sc.input_transcription.text, "timestamp": now_iso()})
                        if sc.model_turn and sc.model_turn.parts:
                            for part in sc.model_turn.parts:
                                if part.inline_data and part.inline_data.data:
                                    pcm24 = np.frombuffer(part.inline_data.data, dtype="<i2")
                                    pcm16 = resample_pcm(pcm24, 24000, 16000)
                                    recorder.add(time.time() * 1000, pcm16)
                                    try:
                                        await ws.send_text(json.dumps({
                                            "event": "playAudio",
                                            "media": {"contentType": "audio/x-l16", "sampleRate": 16000,
                                                      "payload": pcm_to_b64(pcm16)}}))
                                    except Exception:
                                        return
                        if time.time() - last_flush > 12:
                            last_flush = time.time()
                            await flush()

            t1 = asyncio.create_task(pump_telephony())
            t2 = asyncio.create_task(pump_gemini())
            done, pending = await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
            for p in pending:
                p.cancel()
            for d in done:
                exc = d.exception()
                if exc and not isinstance(exc, (WebSocketDisconnect, asyncio.CancelledError)):
                    logger.error(f"[Bridge] pump error: {exc}")
    except Exception as e:
        logger.error(f"[Bridge] Session error for {call_id}: {e}")
        await db.call_logs.update_one({"id": call_id}, {"$set": {"status": "failed", "error": str(e)[:500]}})
    finally:
        try:
            await ws.close()
        except Exception:
            pass
        await _finalize_call(call_id, call, recorder, transcript, tool_records, state, ctx)


async def _finalize_call(call_id, call, recorder, transcript, tool_records, state, ctx):
    ended = datetime.now(timezone.utc)
    connected_ms = state.get("connected_at")
    duration = int(ended.timestamp() - connected_ms / 1000) if connected_ms else 0
    upd = {"ended_at": ended.isoformat(), "duration_seconds": max(0, duration),
           "transcript": transcript, "tool_calls": tool_records}
    if connected_ms:
        upd["status"] = "completed"
        path = RECORDINGS_DIR / f"{call_id}.wav"
        try:
            if recorder.write_wav(str(path), connected_ms):
                upd["recording_url"] = f"/api/calls/{call_id}/recording"
        except Exception as e:
            logger.error(f"[Bridge] recording write failed: {e}")
    else:
        upd["status"] = "failed"
    if ctx.get("contact_id"):
        upd["contact_id"] = ctx["contact_id"]
    await db.call_logs.update_one({"id": call_id}, {"$set": upd})

    # CRM: bump call count
    phone = ctx.get("from_number")
    if phone:
        await db.contacts.update_one({"phone": phone}, {"$inc": {"total_calls": 1}, "$set": {"last_contacted_at": now_iso()}})

    # Campaign bookkeeping
    if call and call.get("campaign_id"):
        from services.campaign_runner import finalize_campaign_contact
        cc_id = call.get("campaign_contact_id") or (await db.call_logs.find_one({"id": call_id}, {"_id": 0, "campaign_contact_id": 1}) or {}).get("campaign_contact_id", "")
        if cc_id:
            await finalize_campaign_contact(call["campaign_id"], cc_id, connected=bool(connected_ms))

    if connected_ms and transcript:
        from services.summary import generate_call_summary
        asyncio.create_task(generate_call_summary(call_id))
    logger.info(f"[Bridge] Call {call_id} finalized ({upd['status']}, {duration}s, {len(transcript)} transcript lines)")
