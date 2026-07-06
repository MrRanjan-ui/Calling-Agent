import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_id(prefix=""):
    return f"{prefix}{uuid.uuid4().hex[:12]}"


class Persona(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("per_"))
    name: str
    role: str = "AI Agent"
    description: str = ""
    voice: str = "Kore"
    system_instruction: str = "You are a helpful AI calling agent."
    initial_greeting: str = "Hello! How can I help you today?"
    temperature: float = 0.7
    language_hint: str = "English"
    enabled_tools: List[str] = []
    knowledge_base_ids: List[str] = []
    is_default: bool = False
    accent_color: str = "#002FA7"
    created_at: str = Field(default_factory=now_iso)


class TranscriptLine(BaseModel):
    role: str
    text: str
    timestamp: str = Field(default_factory=now_iso)


class ToolCallRecord(BaseModel):
    name: str
    args: Dict[str, Any] = {}
    result: Any = None
    timestamp: str = Field(default_factory=now_iso)


class CallLog(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("call_"))
    call_uuid: str = ""
    persona_id: str = ""
    persona_name: str = ""
    direction: str = "inbound"
    from_number: str = ""
    to_number: str = ""
    status: str = "initiated"
    started_at: str = Field(default_factory=now_iso)
    connected_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_seconds: int = 0
    transcript: List[TranscriptLine] = []
    tool_calls: List[ToolCallRecord] = []
    summary: str = ""
    outcome: str = ""
    sentiment: str = ""
    recording_url: str = ""
    campaign_id: str = ""
    contact_id: str = ""
    error: str = ""


class Note(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("note_"))
    text: str
    created_at: str = Field(default_factory=now_iso)


class Contact(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("con_"))
    name: str = ""
    phone: str = ""
    email: str = ""
    company: str = ""
    avatar: str = ""
    notes: List[Note] = []
    tags: List[str] = []
    custom_fields: Dict[str, str] = {}
    lifetime_value: float = 0
    lead_status: str = "new"
    pipeline_id: str = ""
    stage_id: str = ""
    last_contacted_at: Optional[str] = None
    total_calls: int = 0
    created_at: str = Field(default_factory=now_iso)


class PipelineStage(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("stg_"))
    name: str
    order: int = 0


class Pipeline(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("pip_"))
    name: str
    stages: List[PipelineStage] = []
    created_at: str = Field(default_factory=now_iso)


class CampaignContact(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("cc_"))
    name: str = ""
    phone: str
    contact_id: str = ""
    status: str = "queued"  # queued|dialing|completed|failed|retry_scheduled
    attempts: int = 0
    last_call_id: str = ""
    next_attempt_at: Optional[str] = None
    dialing_started_at: Optional[str] = None


class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("cmp_"))
    name: str
    persona_id: str = ""
    status: str = "draft"  # draft|scheduled|running|paused|completed
    dialing_mode: str = "power"  # preview|progressive|power|predictive
    contacts: List[CampaignContact] = []
    max_concurrent: int = 1
    pacing_seconds: int = 10
    max_retries: int = 2
    retry_delay_minutes: int = 15
    call_window_start: str = "09:00"
    call_window_end: str = "21:00"
    timezone: str = "Asia/Kolkata"
    scheduled_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class KBDocument(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("doc_"))
    title: str
    source_type: str = "text"  # text|pdf|url|faq
    content: str = ""
    created_at: str = Field(default_factory=now_iso)


class KnowledgeBase(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("kb_"))
    name: str
    description: str = ""
    documents: List[KBDocument] = []
    created_at: str = Field(default_factory=now_iso)


class CustomTool(BaseModel):
    id: str = Field(default_factory=lambda: gen_id("tool_"))
    name: str
    description: str = ""
    webhook_url: str
    method: str = "POST"
    parameters: Dict[str, Any] = {}  # JSON schema properties {param: {type, description}}
    required: List[str] = []
    enabled: bool = True
    created_at: str = Field(default_factory=now_iso)
