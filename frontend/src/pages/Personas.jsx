import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, Mic, Headphones } from "lucide-react";
import { api } from "../lib/api";
import WebCallDialog from "../components/WebCallDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const EMPTY = {
  name: "", role: "AI Agent", description: "", voice: "Kore", language_hint: "English",
  initial_greeting: "Hello! How can I help you today?", temperature: 0.7,
  system_instruction: "", enabled_tools: [], knowledge_base_ids: [], is_default: false, accent_color: "#002FA7",
};

export default function Personas() {
  const [personas, setPersonas] = useState([]);
  const [options, setOptions] = useState({ voices: [], builtin_tools: [], custom_tools: [] });
  const [kbs, setKbs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [testPersona, setTestPersona] = useState(null);

  const load = () => {
    api.get("/personas").then((r) => setPersonas(r.data));
    api.get("/personas/meta/options").then((r) => setOptions(r.data));
    api.get("/knowledge-bases").then((r) => setKbs(r.data));
  };
  useEffect(load, []);

  const openEdit = (p) => {
    setForm(p ? { ...p } : { ...EMPTY });
    setEditing(p ? p.id : "new");
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    try {
      if (editing === "new") await api.post("/personas", form);
      else await api.put(`/personas/${editing}`, form);
      toast.success("Persona saved — live for the very next call");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  };

  const del = async (id) => {
    await api.delete(`/personas/${id}`);
    toast.success("Persona deleted");
    load();
  };

  const toggleTool = (name) => {
    setForm((f) => ({ ...f, enabled_tools: f.enabled_tools.includes(name) ? f.enabled_tools.filter((t) => t !== name) : [...f.enabled_tools, name] }));
  };
  const toggleKb = (id) => {
    setForm((f) => ({ ...f, knowledge_base_ids: f.knowledge_base_ids.includes(id) ? f.knowledge_base_ids.filter((k) => k !== id) : [...f.knowledge_base_ids, id] }));
  };

  return (
    <div className="p-8" data-testid="personas-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Personas</h1>
          <p className="text-sm text-zinc-500 mt-1">AI agents with unique voices, prompts and tools — triggered dynamically per call</p>
        </div>
        <Button onClick={() => openEdit(null)} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="create-persona-button">
          <Plus size={15} className="mr-1.5" /> New Persona
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personas.map((p) => (
          <div key={p.id} className="border border-slate-200 rounded-sm bg-white p-5 flex flex-col" data-testid={`persona-card-${p.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-sm flex items-center justify-center text-white font-heading font-bold text-lg" style={{ background: p.accent_color || "#002FA7" }}>
                  {p.name[0]}
                </div>
                <div>
                  <div className="font-heading font-bold flex items-center gap-1.5">{p.name} {p.is_default && <Star size={12} className="text-yellow-500 fill-yellow-500" />}</div>
                  <div className="text-xs text-zinc-500">{p.role}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(p)} className="p-1.5 text-zinc-400 hover:text-[#002FA7]" data-testid={`edit-persona-${p.id}`}><Pencil size={14} /></button>
                <button onClick={() => del(p.id)} className="p-1.5 text-zinc-400 hover:text-red-600" data-testid={`delete-persona-${p.id}`}><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-xs text-zinc-600 mt-3 flex-1 line-clamp-2">{p.description || p.system_instruction?.slice(0, 120)}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Badge className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-700 text-[10px]"><Mic size={9} className="mr-1" />{p.voice}</Badge>
              <Badge className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-700 text-[10px]">{p.language_hint}</Badge>
              <Badge className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-700 text-[10px]">{(p.enabled_tools || []).length} tools</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={() => setTestPersona(p)}
              className="mt-4 w-full rounded-sm border-[#002FA7] text-[#002FA7] hover:bg-blue-50 hover:text-[#002080]" data-testid={`test-persona-${p.id}`}>
              <Headphones size={13} className="mr-1.5" /> Test in Browser
            </Button>
          </div>
        ))}
      </div>

      <WebCallDialog persona={testPersona} open={!!testPersona} onClose={() => setTestPersona(null)} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="persona-editor-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing === "new" ? "Create Persona" : "Edit Persona"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 rounded-sm" data-testid="persona-name-input" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Role</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1.5 rounded-sm" data-testid="persona-role-input" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Voice</Label>
                <Select value={form.voice} onValueChange={(v) => setForm({ ...form, voice: v })}>
                  <SelectTrigger className="mt-1.5 rounded-sm" data-testid="persona-voice-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{options.voices.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Language</Label>
                <Input value={form.language_hint} onChange={(e) => setForm({ ...form, language_hint: e.target.value })} className="mt-1.5 rounded-sm" data-testid="persona-language-input" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Temperature</Label>
                <Input type="number" step="0.1" min="0" max="2" value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0.7 })} className="mt-1.5 rounded-sm font-mono" data-testid="persona-temperature-input" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5 rounded-sm" data-testid="persona-description-input" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Initial Greeting</Label>
              <Input value={form.initial_greeting} onChange={(e) => setForm({ ...form, initial_greeting: e.target.value })} className="mt-1.5 rounded-sm" data-testid="persona-greeting-input" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">System Instruction (Prompt)</Label>
              <Textarea rows={8} value={form.system_instruction} onChange={(e) => setForm({ ...form, system_instruction: e.target.value })}
                className="mt-1.5 rounded-sm font-mono text-xs" data-testid="persona-prompt-input" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Enabled Tools</Label>
              <div className="mt-2 grid grid-cols-2 gap-1.5 border border-slate-200 rounded-sm p-3 max-h-48 overflow-y-auto">
                {[...options.builtin_tools, ...options.custom_tools.map((t) => ({ ...t, custom: true }))].map((t) => (
                  <label key={t.name} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-slate-50 p-1 rounded-sm">
                    <Checkbox checked={form.enabled_tools.includes(t.name)} onCheckedChange={() => toggleTool(t.name)} data-testid={`tool-checkbox-${t.name}`} />
                    <span><span className="font-mono font-medium">{t.name}</span>{t.custom && <Badge className="ml-1 rounded-sm text-[9px] bg-purple-100 text-purple-800 border-purple-200 border">n8n</Badge>}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Knowledge Bases</Label>
              <div className="mt-2 space-y-1.5 border border-slate-200 rounded-sm p-3">
                {kbs.length === 0 && <div className="text-xs text-zinc-400">No knowledge bases yet — create one in the Knowledge Base page</div>}
                {kbs.map((kb) => (
                  <label key={kb.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={form.knowledge_base_ids.includes(kb.id)} onCheckedChange={() => toggleKb(kb.id)} data-testid={`kb-checkbox-${kb.id}`} />
                    {kb.name} <span className="text-zinc-400">({(kb.documents || []).length} docs)</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border border-slate-200 rounded-sm p-3">
              <div>
                <div className="text-sm font-medium">Default persona</div>
                <div className="text-xs text-zinc-500">Used for inbound calls when no routing matches</div>
              </div>
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} data-testid="persona-default-switch" />
            </div>
            <Button onClick={save} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="persona-save-button">Save Persona</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
