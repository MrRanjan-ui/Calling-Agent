from db import db

BUILTIN_TOOLS = [
    {
        "name": "end_call",
        "description": "Ends the phone call politely. Use when the conversation is finished or the caller asks to hang up.",
        "parameters": {"type": "OBJECT", "properties": {
            "reason": {"type": "STRING", "description": "Short reason for ending the call"}}},
    },
    {
        "name": "transfer_to_department",
        "description": "Transfers/escalates the call to a human agent or specific department when the caller requests it or the query is too complex.",
        "parameters": {"type": "OBJECT", "properties": {
            "department": {"type": "STRING", "description": "Department name e.g. sales, support, billing"},
            "reason": {"type": "STRING", "description": "Reason for transfer"}},
            "required": ["department"]},
    },
    {
        "name": "search_knowledge_base",
        "description": "Searches the company knowledge base (FAQs, policies, product catalog, pricing, manuals) to answer the caller's question with factual information.",
        "parameters": {"type": "OBJECT", "properties": {
            "query": {"type": "STRING", "description": "Search query based on the caller's question"}},
            "required": ["query"]},
    },
    {
        "name": "update_lead_status",
        "description": "Updates the CRM lead status of the caller based on how the conversation went.",
        "parameters": {"type": "OBJECT", "properties": {
            "status": {"type": "STRING", "description": "One of: new, contacted, qualified, proposal, won, lost"},
            "note": {"type": "STRING", "description": "Short note about why"}},
            "required": ["status"]},
    },
    {
        "name": "add_contact_note",
        "description": "Saves an important note about the caller to their CRM profile (preferences, requests, follow-up items).",
        "parameters": {"type": "OBJECT", "properties": {
            "note": {"type": "STRING", "description": "The note text to save"}},
            "required": ["note"]},
    },
    {
        "name": "schedule_callback",
        "description": "Schedules a callback for the caller at their preferred date and time.",
        "parameters": {"type": "OBJECT", "properties": {
            "datetime": {"type": "STRING", "description": "Requested callback date/time in ISO format or natural language"},
            "topic": {"type": "STRING", "description": "What the callback is about"}},
            "required": ["datetime"]},
    },
    {
        "name": "create_calendar_event",
        "description": "Books an appointment/meeting on the business Google Calendar.",
        "parameters": {"type": "OBJECT", "properties": {
            "summary": {"type": "STRING", "description": "Event title"},
            "description": {"type": "STRING", "description": "Event details"},
            "start_time": {"type": "STRING", "description": "ISO 8601 start time e.g. 2026-06-10T15:00:00+05:30"},
            "end_time": {"type": "STRING", "description": "ISO 8601 end time"}},
            "required": ["summary", "start_time", "end_time"]},
    },
    {
        "name": "list_calendar_events",
        "description": "Lists upcoming events on the business Google Calendar to check availability.",
        "parameters": {"type": "OBJECT", "properties": {
            "max_results": {"type": "INTEGER", "description": "Max events to return, default 5"}}},
    },
]


async def get_custom_tools():
    return await db.custom_tools.find({"enabled": True}, {"_id": 0}).to_list(200)


async def build_function_declarations(enabled_tools: list):
    """Returns Gemini function declarations for a persona. enabled_tools contains builtin names and custom tool ids/names."""
    decls = []
    custom = await get_custom_tools()
    custom_by_key = {}
    for t in custom:
        custom_by_key[t["id"]] = t
        custom_by_key[t["name"]] = t

    names = enabled_tools or [t["name"] for t in BUILTIN_TOOLS]
    added = set()
    for name in names:
        if name in added:
            continue
        builtin = next((b for b in BUILTIN_TOOLS if b["name"] == name), None)
        if builtin:
            decls.append(builtin)
            added.add(name)
            continue
        ct = custom_by_key.get(name)
        if ct:
            params = {"type": "OBJECT", "properties": ct.get("parameters") or {}}
            if ct.get("required"):
                params["required"] = ct["required"]
            decls.append({"name": ct["name"], "description": ct.get("description", ""), "parameters": params})
            added.add(name)
    return decls
