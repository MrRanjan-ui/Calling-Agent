"""VoxFlow backend API tests - covers dashboard, personas, telephony, CRM, pipelines,
campaigns, knowledge bases, custom tools and settings. Does NOT trigger outbound calls."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vapi-rebuild.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ── Dashboard ──────────────────────────────────────────────
def test_dashboard_stats(s):
    r = s.get(f"{BASE_URL}/api/dashboard/stats")
    assert r.status_code == 200
    d = r.json()
    assert d["personas"] >= 3
    assert d["contacts"] >= 4
    assert isinstance(d["daily_volume"], list) and len(d["daily_volume"]) == 7
    assert "lead_counts" in d and "sentiments" in d


# ── Personas ──────────────────────────────────────────────
class TestPersonas:
    created_id = None

    def test_list(self, s):
        r = s.get(f"{BASE_URL}/api/personas")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3

    def test_meta_options(self, s):
        r = s.get(f"{BASE_URL}/api/personas/meta/options")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["voices"], list) and len(d["voices"]) > 0
        assert isinstance(d["builtin_tools"], list)
        assert "custom_tools" in d

    def test_create_update_delete(self, s):
        payload = {"name": "TEST_Persona", "role": "Tester", "system_prompt": "You test.",
                   "voice": "Kore", "language": "en", "enabled_tools": []}
        r = s.post(f"{BASE_URL}/api/personas", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert pid
        # update voice + prompt + tools
        r2 = s.put(f"{BASE_URL}/api/personas/{pid}",
                   json={"voice": "Puck", "system_prompt": "Updated", "enabled_tools": ["end_call"]})
        assert r2.status_code == 200
        upd = r2.json()
        assert upd["voice"] == "Puck"
        assert upd["system_prompt"] == "Updated"
        assert upd["enabled_tools"] == ["end_call"]
        # verify persistence via list
        r3 = s.get(f"{BASE_URL}/api/personas")
        assert any(p["id"] == pid and p["voice"] == "Puck" for p in r3.json())
        # delete
        r4 = s.delete(f"{BASE_URL}/api/personas/{pid}")
        assert r4.status_code == 200


# ── Telephony inbound XML ─────────────────────────────────
def test_inbound_xml_get(s):
    r = s.get(f"{BASE_URL}/api/telephony/inbound")
    assert r.status_code == 200
    body = r.text
    assert "<Stream" in body or "<stream" in body.lower()
    assert "wss://" in body


def test_inbound_xml_post(s):
    r = s.post(f"{BASE_URL}/api/telephony/inbound", data={"From": "+911234567890"})
    assert r.status_code == 200
    assert "wss://" in r.text


# ── Contacts CRUD ─────────────────────────────────────────
class TestContacts:
    def test_list_has_seed(self, s):
        r = s.get(f"{BASE_URL}/api/contacts")
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_create_update_note_detail(self, s):
        c = {"name": "TEST_Contact", "phone": "+911111111111", "email": "t@t.com",
             "lead_status": "new", "tags": ["test"]}
        r = s.post(f"{BASE_URL}/api/contacts", json=c)
        assert r.status_code == 200
        cid = r.json()["id"]

        # update lead_status
        r2 = s.put(f"{BASE_URL}/api/contacts/{cid}", json={"lead_status": "qualified"})
        assert r2.status_code == 200
        assert r2.json()["lead_status"] == "qualified"

        # add note
        r3 = s.post(f"{BASE_URL}/api/contacts/{cid}/notes", json={"text": "Interested"})
        assert r3.status_code == 200

        # detail with interactions
        r4 = s.get(f"{BASE_URL}/api/contacts/{cid}")
        assert r4.status_code == 200
        d = r4.json()
        assert "interactions" in d and isinstance(d["interactions"], list)
        assert any(n["text"] == "Interested" for n in d.get("notes", []))

        s.delete(f"{BASE_URL}/api/contacts/{cid}")


# ── Pipelines / Kanban ────────────────────────────────────
class TestPipelines:
    def test_list_seeded(self, s):
        r = s.get(f"{BASE_URL}/api/pipelines")
        assert r.status_code == 200
        pipes = r.json()
        assert len(pipes) >= 1
        assert any(p["name"] == "Sales Pipeline" and len(p["stages"]) == 6 for p in pipes)

    def test_board_and_move(self, s):
        pipes = s.get(f"{BASE_URL}/api/pipelines").json()
        pipe = next(p for p in pipes if p["name"] == "Sales Pipeline")
        pid = pipe["id"]
        r = s.get(f"{BASE_URL}/api/pipelines/{pid}/board")
        assert r.status_code == 200
        board = r.json()
        assert "columns" in board and "unassigned" in board
        assert len(board["columns"]) == 6

        # Move an unassigned contact to first stage
        if board["unassigned"]:
            contact = board["unassigned"][0]
            stage_id = pipe["stages"][0]["id"]
            r2 = s.post(f"{BASE_URL}/api/pipelines/move",
                        json={"contact_id": contact["id"], "pipeline_id": pid, "stage_id": stage_id})
            assert r2.status_code == 200
            # verify
            b2 = s.get(f"{BASE_URL}/api/pipelines/{pid}/board").json()
            assert any(card["id"] == contact["id"] for card in b2["columns"][0]["cards"])


# ── Campaigns (create + pause only) ───────────────────────
def test_campaign_create_and_pause(s):
    payload = {"name": "TEST_Campaign", "persona_id": "", "contacts": [
        {"name": "Test", "phone": "+919999999999"}]}
    r = s.post(f"{BASE_URL}/api/campaigns", json=payload)
    assert r.status_code == 200
    c = r.json()
    cid = c["id"]
    assert c["stats"]["total"] == 1
    # pause
    r2 = s.post(f"{BASE_URL}/api/campaigns/{cid}/pause")
    assert r2.status_code == 200
    # verify status
    r3 = s.get(f"{BASE_URL}/api/campaigns/{cid}")
    assert r3.status_code == 200
    assert r3.json()["status"] == "paused"
    s.delete(f"{BASE_URL}/api/campaigns/{cid}")


# ── Knowledge bases ───────────────────────────────────────
def test_knowledge_base_full_flow(s):
    r = s.post(f"{BASE_URL}/api/knowledge-bases", json={"name": "TEST_KB", "description": "d"})
    assert r.status_code == 200
    kb_id = r.json()["id"]

    r2 = s.post(f"{BASE_URL}/api/knowledge-bases/{kb_id}/documents",
                json={"title": "Doc1", "content": "Hello knowledge base"})
    assert r2.status_code == 200

    r3 = s.post(f"{BASE_URL}/api/knowledge-bases/{kb_id}/documents/url",
                json={"url": "https://example.com"})
    assert r3.status_code == 200, r3.text
    doc_id = r3.json()["id"]

    r4 = s.get(f"{BASE_URL}/api/knowledge-bases/{kb_id}")
    assert r4.status_code == 200
    assert len(r4.json()["documents"]) >= 2

    r5 = s.delete(f"{BASE_URL}/api/knowledge-bases/{kb_id}/documents/{doc_id}")
    assert r5.status_code == 200

    s.delete(f"{BASE_URL}/api/knowledge-bases/{kb_id}")


# ── Custom Tools ──────────────────────────────────────────
def test_custom_tools_full_flow(s):
    payload = {"name": "check_order_status_test", "description": "check order",
               "webhook_url": "https://httpbin.org/post", "method": "POST",
               "parameters": {"order_id": {"type": "string", "description": "Order id"}},
               "required": ["order_id"]}
    r = s.post(f"{BASE_URL}/api/tools", json=payload)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    # Verify appears in personas meta custom_tools
    meta = s.get(f"{BASE_URL}/api/personas/meta/options").json()
    assert any(ct["name"] == "check_order_status_test" for ct in meta["custom_tools"])

    # Update
    r2 = s.put(f"{BASE_URL}/api/tools/{tid}", json={"description": "updated"})
    assert r2.status_code == 200
    assert r2.json()["description"] == "updated"

    # Test endpoint
    r3 = s.post(f"{BASE_URL}/api/tools/{tid}/test", json={"args": {"order_id": "123"}})
    assert r3.status_code == 200
    body = r3.json()
    assert "status_code" in body

    s.delete(f"{BASE_URL}/api/tools/{tid}")


# ── Settings ──────────────────────────────────────────────
def test_settings_masked_and_update(s):
    r = s.get(f"{BASE_URL}/api/settings")
    assert r.status_code == 200
    settings = r.json()
    # gemini_api_key masked (either dots or SET)
    key = settings.get("gemini_api_key", "")
    assert (("•" in key) or key in ("", "SET")) or settings.get("gemini_api_key_set") is not None

    original_brand = settings.get("brand_name", "")
    new_brand = "TEST_Brand"
    r2 = s.put(f"{BASE_URL}/api/settings",
               json={"brand_name": new_brand, "gemini_api_key": settings.get("gemini_api_key", "")})
    assert r2.status_code == 200
    updated = r2.json()
    assert updated["brand_name"] == new_brand
    # gemini_api_key should not be wiped (still set)
    if settings.get("gemini_api_key_set"):
        assert updated.get("gemini_api_key_set") is True

    # restore
    s.put(f"{BASE_URL}/api/settings", json={"brand_name": original_brand})


def test_webhook_info(s):
    r = s.get(f"{BASE_URL}/api/settings/webhook-info")
    assert r.status_code == 200
    assert "inbound_answer_url" in r.json()
    assert "/api/telephony/inbound" in r.json()["inbound_answer_url"]
