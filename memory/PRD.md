# VoxFlow — AI Calling Agent Platform (Vapi/Retell style)

## Original Problem Statement
Rebuild the Hotel-receptionist GitHub codebase (Node/TS Gemini+Vobiz calling agent) as a fully modular, per-client deployable AI calling platform. Voice: Gemini realtime live model. Telephony: Vobiz. Everything customizable from the frontend in real time. n8n webhook tools. Inbound + outbound, multiple dynamic personas, call summary & recording, campaigns (bulk/scheduled/retry/pacing/dialing modes), AI receptionist/IVR/routing/callbacks, full CRM (profiles/leads/pipelines/kanban), Google Calendar, knowledge base (PDF/website/FAQ/docs), proper dashboard.

## User Personas
- Agency owner (the user): deploys one instance per client, customizes via Settings/Personas.
- Client team: uses dashboard daily — campaigns, CRM, call review.

## Architecture
- FastAPI backend (port 8001) + React (CRA) frontend + MongoDB (uuid string ids, no ObjectId).
- Voice pipeline: Vobiz `<Stream>` XML → WS `/api/telephony/stream` (L16@16kHz JSON events) ↔ Gemini Live (`google-genai` SDK, model `gemini-3.1-flash-live-preview`, 24kHz out resampled to 16kHz via numpy).
- Backend layout: `routes/` (telephony, calls, personas, campaigns, crm, knowledge, custom_tools, settings_routes, dashboard), `services/` (gemini_bridge, call_service, vobiz, campaign_runner, tool_executor, tools_registry, summary, audio, settings_service, google_calendar), `seed.py`.
- Recordings: mixed WAV in `/app/backend/recordings`, served at `/api/calls/{id}/recording`.
- Campaign runner: asyncio loop (8s tick) — scheduled activation, call window (timezone-aware), pacing, concurrency by dialing mode (preview/progressive/power/predictive), retries with delay, stale-dial timeout.
- Post-call: Gemini flash summary (JSON: summary/outcome/sentiment/lead suggestion) → auto CRM update (contact auto-create, note append, lead status progression).
- Builtin tools: end_call, transfer_to_department, search_knowledge_base, update_lead_status, add_contact_note, schedule_callback, create/list_calendar_events. Custom tools = n8n webhooks (params schema built in UI).
- Config: all creds editable in Settings (masked), stored in Mongo `settings` collection, falls back to .env. `PUBLIC_BASE_URL` in backend/.env drives webhook/WS URLs.

## Implemented (2026-06 / initial build)
- ✅ Full backend + frontend (Dashboard, Call Logs w/ transcript+recording+summary viewer, Personas editor, Campaigns, Contacts CRM, Pipelines kanban (HTML5 DnD), Knowledge Base (text/PDF/URL), n8n Tools builder w/ test, Settings)
- ✅ Seeded: 3 personas (Riya receptionist / Arjun sales / Neha support), Sales Pipeline, 4 sample contacts
- ✅ Testing: iteration_1 — backend 15/15 pass, frontend all flows pass
- ⚠️ NOT live-verified: actual phone call audio bridge (needs real Vobiz call; ported 1:1 from working repo logic). Google Calendar needs client OAuth creds entered in Settings.

## Vobiz inbound setup (manual step for user)
Set on Vobiz number: Answer URL = `{PUBLIC_BASE_URL}/api/telephony/inbound` (POST), Hangup URL = `{PUBLIC_BASE_URL}/api/telephony/hangup`.

## Backlog
- P0: Live call verification with real Vobiz number (inbound + outbound), tune barge-in/interruption handling
- P1: Browser test-call (mic → Gemini) for persona preview without telephony cost; number-to-persona routing rules; IVR menu builder; call transfer via Vobiz mid-call API
- P1: Campaign analytics per-campaign report; CSV file upload for campaigns
- P2: Multi-workspace auth (per-client login), wallet/credits tracking, webhooks-out on call events, callback auto-dial queue
