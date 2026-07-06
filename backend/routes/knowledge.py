import io
import re
import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from db import db
from models import KnowledgeBase, KBDocument

router = APIRouter()


@router.get("/knowledge-bases")
async def list_kbs():
    kbs = await db.knowledge_bases.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    for kb in kbs:
        for d in kb.get("documents", []):
            d["content_length"] = len(d.get("content", ""))
            d["content"] = d.get("content", "")[:300]
    return kbs


@router.get("/knowledge-bases/{kb_id}")
async def get_kb(kb_id: str):
    kb = await db.knowledge_bases.find_one({"id": kb_id}, {"_id": 0})
    if not kb:
        raise HTTPException(404, "Knowledge base not found")
    return kb


@router.post("/knowledge-bases")
async def create_kb(body: dict):
    kb = KnowledgeBase(name=body.get("name", "Knowledge Base"), description=body.get("description", ""))
    await db.knowledge_bases.insert_one(kb.model_dump())
    return kb


@router.put("/knowledge-bases/{kb_id}")
async def update_kb(kb_id: str, patch: dict):
    patch.pop("_id", None)
    patch.pop("id", None)
    patch.pop("documents", None)
    await db.knowledge_bases.update_one({"id": kb_id}, {"$set": patch})
    return {"success": True}


@router.delete("/knowledge-bases/{kb_id}")
async def delete_kb(kb_id: str):
    await db.knowledge_bases.delete_one({"id": kb_id})
    return {"success": True}


@router.post("/knowledge-bases/{kb_id}/documents")
async def add_text_doc(kb_id: str, body: dict):
    doc = KBDocument(title=body.get("title", "Untitled"), source_type=body.get("source_type", "text"),
                     content=body.get("content", ""))
    res = await db.knowledge_bases.update_one({"id": kb_id}, {"$push": {"documents": doc.model_dump()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Knowledge base not found")
    return doc


@router.post("/knowledge-bases/{kb_id}/documents/pdf")
async def upload_pdf(kb_id: str, file: UploadFile = File(...), title: str = Form("")):
    from pypdf import PdfReader
    data = await file.read()
    try:
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse PDF: {e}")
    if not text.strip():
        raise HTTPException(400, "No extractable text found in PDF")
    doc = KBDocument(title=title or file.filename or "PDF Document", source_type="pdf", content=text[:100000])
    await db.knowledge_bases.update_one({"id": kb_id}, {"$push": {"documents": doc.model_dump()}})
    return {"id": doc.id, "title": doc.title, "chars": len(doc.content)}


@router.post("/knowledge-bases/{kb_id}/documents/url")
async def fetch_url_doc(kb_id: str, body: dict):
    url = body.get("url", "")
    if not url.startswith("http"):
        raise HTTPException(400, "Invalid URL")
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
    except Exception as e:
        raise HTTPException(400, f"Failed to fetch URL: {e}")
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = re.sub(r"\n{3,}", "\n\n", soup.get_text(separator="\n")).strip()
    if not text:
        raise HTTPException(400, "No text content extracted from URL")
    title = body.get("title") or (soup.title.string.strip() if soup.title and soup.title.string else url)
    doc = KBDocument(title=title, source_type="url", content=text[:100000])
    await db.knowledge_bases.update_one({"id": kb_id}, {"$push": {"documents": doc.model_dump()}})
    return {"id": doc.id, "title": doc.title, "chars": len(doc.content)}


@router.delete("/knowledge-bases/{kb_id}/documents/{doc_id}")
async def delete_doc(kb_id: str, doc_id: str):
    await db.knowledge_bases.update_one({"id": kb_id}, {"$pull": {"documents": {"id": doc_id}}})
    return {"success": True}
