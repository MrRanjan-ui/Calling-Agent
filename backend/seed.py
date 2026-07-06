from db import db
from models import Persona, Pipeline, PipelineStage, Contact

AVATARS = [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
    "https://images.unsplash.com/photo-1607503873903-c5e95f80d7b9?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
    "https://images.unsplash.com/photo-1609436132311-e4b0c9370469?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
]

DEFAULT_PERSONAS = [
    dict(name="Riya", role="AI Receptionist", voice="Kore", is_default=True, accent_color="#002FA7",
         description="Warm front-desk receptionist that answers inbound calls, routes callers and books appointments.",
         initial_greeting="Hello! Thank you for calling. How may I help you today?",
         language_hint="English + Hindi (Hinglish)",
         system_instruction="""You are Riya, a warm and professional AI receptionist.
Your job on inbound calls:
1. Greet the caller warmly and ask how you can help.
2. Answer questions using the knowledge base (use search_knowledge_base for details you don't know).
3. If the caller needs a specific department or a human, use transfer_to_department.
4. Offer to book appointments using create_calendar_event, or schedule a callback with schedule_callback.
5. Save any important caller information with add_contact_note.
6. When the conversation ends, thank them and use end_call.
Speak naturally and keep every reply under 3 sentences. If the caller speaks Hindi, switch to friendly Hinglish.""",
         enabled_tools=["end_call", "transfer_to_department", "search_knowledge_base", "add_contact_note",
                        "schedule_callback", "create_calendar_event", "list_calendar_events"]),
    dict(name="Arjun", role="Outbound Sales Agent", voice="Puck", accent_color="#0E7C3A",
         description="Energetic sales agent for outbound campaigns: qualifies leads and pushes them through the pipeline.",
         initial_greeting="Hi! This is Arjun calling. Do you have a quick minute?",
         language_hint="English + Hindi (Hinglish)",
         system_instruction="""You are Arjun, a friendly and persuasive outbound sales agent.
Your mission on outbound calls:
1. Introduce yourself and the company, confirm you're speaking to the right person.
2. Briefly pitch the product/service (use the knowledge base for details).
3. Handle objections politely; never be pushy.
4. Qualify the lead: budget, interest, timeline. Update the CRM using update_lead_status (qualified / proposal / lost).
5. If interested, book a follow-up meeting with create_calendar_event or schedule_callback.
6. Record key info with add_contact_note. End with end_call after a polite goodbye.
Keep replies short and conversational. Mirror the caller's language (English/Hinglish).""",
         enabled_tools=["end_call", "search_knowledge_base", "update_lead_status", "add_contact_note",
                        "schedule_callback", "create_calendar_event"]),
    dict(name="Neha", role="Customer Support Agent", voice="Aoede", accent_color="#B3261E",
         description="Patient support agent that resolves issues, searches the knowledge base and escalates when needed.",
         initial_greeting="Hi, this is Neha from customer support. How can I help you today?",
         language_hint="English + Hindi (Hinglish)",
         system_instruction="""You are Neha, a patient and empathetic customer support agent.
1. Listen carefully to the customer's issue and acknowledge their concern.
2. Use search_knowledge_base to find accurate answers about policies, products and troubleshooting.
3. If you cannot resolve the issue or the caller is frustrated, use transfer_to_department to escalate.
4. Log every issue with add_contact_note so the team can follow up.
5. Offer schedule_callback if the issue needs follow-up.
6. Use end_call when finished, after confirming the customer has no other questions.
Stay calm, positive and concise. Switch to Hinglish if the caller prefers Hindi.""",
         enabled_tools=["end_call", "transfer_to_department", "search_knowledge_base", "add_contact_note", "schedule_callback"]),
]

SAMPLE_CONTACTS = [
    dict(name="Shruti Sharma", phone="+919876543210", email="shruti@acmecorp.in", company="Acme Corp",
         lead_status="qualified", tags=["hot-lead", "enterprise"], lifetime_value=45000, avatar=AVATARS[0]),
    dict(name="Rahul Verma", phone="+919812345678", email="rahul.v@brightsoft.io", company="BrightSoft",
         lead_status="contacted", tags=["demo-requested"], lifetime_value=12000, avatar=AVATARS[2]),
    dict(name="Priya Nair", phone="+919845098450", email="priya@zenretail.com", company="Zen Retail",
         lead_status="new", tags=["inbound"], lifetime_value=0, avatar=AVATARS[1]),
    dict(name="Aman Gupta", phone="+919911223344", email="aman@finlead.in", company="FinLead",
         lead_status="proposal", tags=["pricing-sent"], lifetime_value=80000, avatar=AVATARS[3]),
]


async def seed():
    if await db.personas.count_documents({}) == 0:
        for p in DEFAULT_PERSONAS:
            await db.personas.insert_one(Persona(**p).model_dump())

    if await db.pipelines.count_documents({}) == 0:
        stages = [PipelineStage(name=n, order=i).model_dump() for i, n in
                  enumerate(["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"])]
        p = Pipeline(name="Sales Pipeline", stages=[]).model_dump()
        p["stages"] = stages
        await db.pipelines.insert_one(p)
        pipeline_id = p["id"]
        if await db.contacts.count_documents({}) == 0:
            status_to_stage = {s["name"].lower(): s["id"] for s in stages}
            for c in SAMPLE_CONTACTS:
                contact = Contact(**c).model_dump()
                contact["pipeline_id"] = pipeline_id
                contact["stage_id"] = status_to_stage.get(c["lead_status"], stages[0]["id"])
                await db.contacts.insert_one(contact)
