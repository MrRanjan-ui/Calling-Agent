import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Webhook, FlaskConical } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const EMPTY = { name: "", description: "", webhook_url: "", method: "POST", params: [], enabled: true };

export default function ToolsPage() {
  const [tools, setTools] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [testResult, setTestResult] = useState(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testing, setTesting] = useState(null);

  const load = () => api.get("/tools").then((r) => setTools(r.data));
  useEffect(() => { load(); }, []);

  const openEdit = (t) => {
    if (t) {
      const params = Object.entries(t.parameters || {}).map(([name, spec]) => ({
        name, type: spec.type || "STRING", description: spec.description || "", required: (t.required || []).includes(name),
      }));
      setForm({ ...t, params });
      setEditing(t.id);
    } else {
      setForm(EMPTY);
      setEditing("new");
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.webhook_url.trim()) return toast.error("Name and webhook URL required");
    const parameters = {};
    const required = [];
    form.params.forEach((p) => {
      if (!p.name.trim()) return;
      parameters[p.name] = { type: p.type, description: p.description };
      if (p.required) required.push(p.name);
    });
    const payload = { name: form.name, description: form.description, webhook_url: form.webhook_url, method: form.method, parameters, required, enabled: form.enabled };
    try {
      if (editing === "new") await api.post("/tools", payload);
      else await api.put(`/tools/${editing}`, payload);
      toast.success("Tool saved — enable it in a persona to use it in calls");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  };

  const del = async (id) => {
    await api.delete(`/tools/${id}`);
    load();
  };

  const runTest = async (id) => {
    let args = {};
    try { args = JSON.parse(testArgs); } catch { return toast.error("Test args must be valid JSON"); }
    const r = await api.post(`/tools/${id}/test`, { args });
    setTestResult(r.data);
  };

  const setParam = (i, patch) => {
    const params = [...form.params];
    params[i] = { ...params[i], ...patch };
    setForm({ ...form, params });
  };

  return (
    <div className="p-8" data-testid="tools-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Custom Tools</h1>
          <p className="text-sm text-zinc-500 mt-1">n8n webhook tools the AI can call live during conversations</p>
        </div>
        <Button onClick={() => openEdit(null)} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="create-tool-button">
          <Plus size={15} className="mr-1.5" /> New Tool
        </Button>
      </div>

      <div className="space-y-3">
        {tools.length === 0 && (
          <div className="border border-slate-200 rounded-sm p-10 text-center text-sm text-zinc-400">
            <Webhook className="mx-auto mb-2" size={20} />
            No custom tools yet. Create an n8n webhook tool — e.g. <span className="font-mono">check_order_status</span> — and the AI will call it mid-conversation.
          </div>
        )}
        {tools.map((t) => (
          <div key={t.id} className="border border-slate-200 rounded-sm bg-white p-5" data-testid={`tool-card-${t.id}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Webhook size={16} className="text-[#002FA7]" />
                <span className="font-mono font-semibold text-sm">{t.name}</span>
                <Badge className={`rounded-sm border text-[10px] ${t.enabled ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {t.enabled ? "enabled" : "disabled"}
                </Badge>
                <Badge className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-600 text-[10px]">{t.method}</Badge>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setTesting(t.id); setTestResult(null); setTestArgs("{}"); }} className="p-1.5 text-zinc-400 hover:text-[#002FA7]" data-testid={`test-tool-${t.id}`}><FlaskConical size={14} /></button>
                <button onClick={() => openEdit(t)} className="p-1.5 text-zinc-400 hover:text-[#002FA7]" data-testid={`edit-tool-${t.id}`}><Pencil size={14} /></button>
                <button onClick={() => del(t.id)} className="p-1.5 text-zinc-400 hover:text-red-600" data-testid={`delete-tool-${t.id}`}><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-xs text-zinc-600 mt-2">{t.description}</p>
            <p className="text-[11px] font-mono text-zinc-400 mt-1 truncate">{t.webhook_url}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.keys(t.parameters || {}).map((p) => (
                <Badge key={p} className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-600 text-[10px] font-mono">{p}{(t.required || []).includes(p) && "*"}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="tool-editor-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing === "new" ? "Create Tool" : "Edit Tool"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Tool Name (snake_case)</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="check_order_status" className="mt-1.5 rounded-sm font-mono" data-testid="tool-name-input" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                  <SelectTrigger className="mt-1.5 rounded-sm" data-testid="tool-method-select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Description (tells the AI when to use it)</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Checks the live status of a customer's order by order ID" className="mt-1.5 rounded-sm text-xs" data-testid="tool-description-input" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">n8n Webhook URL</Label>
              <Input value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                placeholder="https://your-n8n.app/webhook/abc123" className="mt-1.5 rounded-sm font-mono text-xs" data-testid="tool-webhook-input" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Parameters</Label>
                <Button size="sm" variant="outline" className="rounded-sm h-7 text-xs"
                  onClick={() => setForm({ ...form, params: [...form.params, { name: "", type: "STRING", description: "", required: false }] })}
                  data-testid="add-param-button"><Plus size={12} className="mr-1" /> Param</Button>
              </div>
              <div className="mt-2 space-y-2">
                {form.params.map((p, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} placeholder="param_name" className="rounded-sm font-mono text-xs w-36 h-8" data-testid={`param-name-${i}`} />
                    <Select value={p.type} onValueChange={(v) => setParam(i, { type: v })}>
                      <SelectTrigger className="rounded-sm w-28 h-8 text-xs" data-testid={`param-type-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["STRING", "NUMBER", "INTEGER", "BOOLEAN"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={p.description} onChange={(e) => setParam(i, { description: e.target.value })} placeholder="description" className="rounded-sm text-xs flex-1 h-8" data-testid={`param-desc-${i}`} />
                    <label className="flex items-center gap-1 text-[10px] text-zinc-500"><Switch checked={p.required} onCheckedChange={(v) => setParam(i, { required: v })} /> req</label>
                    <button onClick={() => setForm({ ...form, params: form.params.filter((_, j) => j !== i) })} className="text-zinc-400 hover:text-red-600"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border border-slate-200 rounded-sm p-3">
              <span className="text-sm">Enabled</span>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} data-testid="tool-enabled-switch" />
            </div>
            <Button onClick={save} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="tool-save-button">Save Tool</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test */}
      <Dialog open={!!testing} onOpenChange={(o) => !o && setTesting(null)}>
        <DialogContent className="rounded-sm max-w-xl" data-testid="tool-test-dialog">
          <DialogHeader><DialogTitle className="font-heading">Test Webhook</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Arguments (JSON)</Label>
              <Textarea rows={4} value={testArgs} onChange={(e) => setTestArgs(e.target.value)} className="mt-1.5 rounded-sm font-mono text-xs" data-testid="test-args-input" />
            </div>
            <Button onClick={() => runTest(testing)} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="test-run-button">Send Test Request</Button>
            {testResult && (
              <pre className="bg-zinc-950 text-green-400 text-xs p-3 rounded-sm overflow-x-auto max-h-56" data-testid="test-result">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
