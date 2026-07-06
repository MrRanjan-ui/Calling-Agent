import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Globe, FileUp, BookOpen } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const ICONS = { text: FileText, faq: FileText, pdf: FileUp, url: Globe };

export default function Knowledge() {
  const [kbs, setKbs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creatingKb, setCreatingKb] = useState(false);
  const [kbName, setKbName] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [doc, setDoc] = useState({ title: "", content: "", source_type: "text" });
  const [url, setUrl] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (keepId) => {
    const r = await api.get("/knowledge-bases");
    setKbs(r.data);
    const id = keepId || selected?.id;
    setSelected(id ? r.data.find((k) => k.id === id) || r.data[0] || null : r.data[0] || null);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const createKb = async () => {
    if (!kbName.trim()) return toast.error("Name required");
    const r = await api.post("/knowledge-bases", { name: kbName });
    setCreatingKb(false);
    setKbName("");
    await load(r.data.id);
    toast.success("Knowledge base created");
  };

  const delKb = async (id) => {
    await api.delete(`/knowledge-bases/${id}`);
    setSelected(null);
    load();
  };

  const addDoc = async () => {
    setBusy(true);
    try {
      if (doc.source_type === "url") {
        if (!url.trim()) return toast.error("Enter a URL");
        const r = await api.post(`/knowledge-bases/${selected.id}/documents/url`, { url, title: doc.title });
        toast.success(`Fetched ${r.data.chars} characters from website`);
      } else if (doc.source_type === "pdf") {
        if (!pdfFile) return toast.error("Choose a PDF file");
        const fd = new FormData();
        fd.append("file", pdfFile);
        fd.append("title", doc.title || pdfFile.name);
        const r = await api.post(`/knowledge-bases/${selected.id}/documents/pdf`, fd);
        toast.success(`Extracted ${r.data.chars} characters from PDF`);
      } else {
        if (!doc.title.trim() || !doc.content.trim()) return toast.error("Title and content required");
        await api.post(`/knowledge-bases/${selected.id}/documents`, doc);
        toast.success("Document added");
      }
      setAddingDoc(false);
      setDoc({ title: "", content: "", source_type: "text" });
      setUrl(""); setPdfFile(null);
      load(selected.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add document");
    } finally {
      setBusy(false);
    }
  };

  const delDoc = async (docId) => {
    await api.delete(`/knowledge-bases/${selected.id}/documents/${docId}`);
    load(selected.id);
  };

  return (
    <div className="p-8" data-testid="knowledge-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-zinc-500 mt-1">PDFs, websites, FAQs & docs the AI searches during calls</p>
        </div>
        <Button onClick={() => setCreatingKb(true)} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="create-kb-button">
          <Plus size={15} className="mr-1.5" /> New Knowledge Base
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          {kbs.length === 0 && <div className="border border-slate-200 rounded-sm p-6 text-center text-xs text-zinc-400">No knowledge bases yet</div>}
          {kbs.map((kb) => (
            <div key={kb.id} onClick={() => setSelected(kb)}
              className={`border rounded-sm p-4 cursor-pointer transition-all duration-150 ${selected?.id === kb.id ? "border-[#002FA7] bg-blue-50/40" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              data-testid={`kb-item-${kb.id}`}>
              <div className="flex items-center justify-between">
                <div className="font-heading font-bold text-sm flex items-center gap-2"><BookOpen size={14} className="text-[#002FA7]" />{kb.name}</div>
                <button onClick={(e) => { e.stopPropagation(); delKb(kb.id); }} className="text-zinc-400 hover:text-red-600" data-testid={`delete-kb-${kb.id}`}><Trash2 size={13} /></button>
              </div>
              <div className="text-xs text-zinc-500 mt-1">{(kb.documents || []).length} documents</div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <div className="border border-slate-200 rounded-sm bg-white">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <span className="font-heading font-bold">{selected.name}</span>
                <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => setAddingDoc(true)} data-testid="add-doc-button">
                  <Plus size={13} className="mr-1" /> Add Document
                </Button>
              </div>
              <div className="divide-y divide-slate-100">
                {(selected.documents || []).length === 0 && <div className="p-8 text-center text-sm text-zinc-400">No documents. Add text, upload a PDF or fetch a website.</div>}
                {(selected.documents || []).map((d) => {
                  const Icon = ICONS[d.source_type] || FileText;
                  return (
                    <div key={d.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50" data-testid={`doc-item-${d.id}`}>
                      <Icon size={15} className="text-[#002FA7] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{d.title}</div>
                        <div className="text-xs text-zinc-500 truncate">{d.content}</div>
                      </div>
                      <Badge className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-600 text-[10px] uppercase">{d.source_type}</Badge>
                      <span className="text-[10px] font-mono text-zinc-400">{(d.content_length || d.content?.length || 0).toLocaleString()} ch</span>
                      <button onClick={() => delDoc(d.id)} className="text-zinc-400 hover:text-red-600" data-testid={`delete-doc-${d.id}`}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-sm p-12 text-center text-sm text-zinc-400">Select or create a knowledge base</div>
          )}
        </div>
      </div>

      <Dialog open={creatingKb} onOpenChange={setCreatingKb}>
        <DialogContent className="rounded-sm" data-testid="kb-create-dialog">
          <DialogHeader><DialogTitle className="font-heading">New Knowledge Base</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={kbName} onChange={(e) => setKbName(e.target.value)} placeholder="e.g. Product Catalog, Company FAQs" className="rounded-sm" data-testid="kb-name-input" />
            <Button onClick={createKb} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="kb-save-button">Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addingDoc} onOpenChange={setAddingDoc}>
        <DialogContent className="rounded-sm max-w-xl" data-testid="doc-add-dialog">
          <DialogHeader><DialogTitle className="font-heading">Add Document</DialogTitle></DialogHeader>
          <Tabs value={doc.source_type} onValueChange={(v) => setDoc({ ...doc, source_type: v })}>
            <TabsList className="rounded-sm w-full">
              <TabsTrigger value="text" className="flex-1 rounded-sm" data-testid="doc-tab-text">Text / FAQ</TabsTrigger>
              <TabsTrigger value="pdf" className="flex-1 rounded-sm" data-testid="doc-tab-pdf">PDF Upload</TabsTrigger>
              <TabsTrigger value="url" className="flex-1 rounded-sm" data-testid="doc-tab-url">Website URL</TabsTrigger>
            </TabsList>
            <div className="mt-4 space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Title</Label>
                <Input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} className="mt-1.5 rounded-sm" data-testid="doc-title-input" />
              </div>
              <TabsContent value="text" className="m-0">
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Content</Label>
                <Textarea rows={8} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })}
                  placeholder="Paste FAQs, SOPs, pricing, policies…" className="mt-1.5 rounded-sm text-xs" data-testid="doc-content-input" />
              </TabsContent>
              <TabsContent value="pdf" className="m-0">
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">PDF File</Label>
                <Input type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files[0])} className="mt-1.5 rounded-sm" data-testid="doc-pdf-input" />
              </TabsContent>
              <TabsContent value="url" className="m-0">
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourwebsite.com/pricing" className="mt-1.5 rounded-sm font-mono text-xs" data-testid="doc-url-input" />
              </TabsContent>
              <Button onClick={addDoc} disabled={busy} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="doc-save-button">
                {busy ? "Processing…" : "Add to Knowledge Base"}
              </Button>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
