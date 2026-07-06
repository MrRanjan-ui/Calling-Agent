import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Play, Pause, Trash2, Upload } from "lucide-react";
import { api, STATUS_COLORS, fmtDate } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const MODES = [
  { v: "preview", label: "Preview — one at a time, review before dial" },
  { v: "progressive", label: "Progressive — steady sequential dialing" },
  { v: "power", label: "Power — dial up to max concurrency" },
  { v: "predictive", label: "Predictive — aggressive 2x pacing" },
];

const EMPTY = {
  name: "", persona_id: "", dialing_mode: "power", max_concurrent: 1, pacing_seconds: 10,
  max_retries: 2, retry_delay_minutes: 15, call_window_start: "09:00", call_window_end: "21:00",
  timezone: "Asia/Kolkata", scheduled_at: "", contactsText: "",
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api.get("/campaigns").then((r) => setCampaigns(r.data));
  }, []);

  useEffect(() => {
    load();
    api.get("/personas").then((r) => setPersonas(r.data));
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const importCrm = async () => {
    const r = await api.get("/contacts");
    const lines = r.data.filter((c) => c.phone).map((c) => `${c.name},${c.phone}`).join("\n");
    setForm((f) => ({ ...f, contactsText: f.contactsText ? f.contactsText + "\n" + lines : lines }));
    toast.success(`Imported ${r.data.length} CRM contacts`);
  };

  const create = async () => {
    if (!form.name.trim()) return toast.error("Campaign name required");
    const contacts = form.contactsText.split("\n").map((l) => {
      const parts = l.split(",").map((s) => s.trim());
      if (parts.length === 1) return { name: "", phone: parts[0] };
      return { name: parts[0], phone: parts[1] };
    }).filter((c) => c.phone && c.phone.replace(/\D/g, "").length >= 8);
    if (contacts.length === 0) return toast.error("Add at least one contact (Name,Phone per line)");
    try {
      const payload = { ...form, contacts };
      delete payload.contactsText;
      if (payload.scheduled_at) payload.scheduled_at = new Date(payload.scheduled_at).toISOString();
      else delete payload.scheduled_at;
      await api.post("/campaigns", payload);
      toast.success("Campaign created");
      setCreating(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create campaign");
    }
  };

  const action = async (id, act) => {
    await api.post(`/campaigns/${id}/${act}`);
    toast.success(act === "start" ? "Campaign running — dialing will begin shortly" : "Campaign paused");
    load();
  };

  const del = async (id) => {
    await api.delete(`/campaigns/${id}`);
    load();
  };

  return (
    <div className="p-8" data-testid="campaigns-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Campaigns</h1>
          <p className="text-sm text-zinc-500 mt-1">Bulk outbound calling with pacing, retries & timezone-aware dialing</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="create-campaign-button">
          <Plus size={15} className="mr-1.5" /> New Campaign
        </Button>
      </div>

      <div className="space-y-3">
        {campaigns.length === 0 && (
          <div className="border border-slate-200 rounded-sm p-10 text-center text-sm text-zinc-400">No campaigns yet. Create one to start bulk calling.</div>
        )}
        {campaigns.map((c) => {
          const done = (c.stats.completed + c.stats.failed);
          const pct = c.stats.total ? Math.round((done / c.stats.total) * 100) : 0;
          return (
            <div key={c.id} className="border border-slate-200 rounded-sm bg-white p-5" data-testid={`campaign-card-${c.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-heading font-bold cursor-pointer hover:text-[#002FA7]" onClick={() => setDetail(c)}>{c.name}</span>
                  <Badge className={`rounded-sm border text-[10px] ${STATUS_COLORS[c.status] || ""}`}>{c.status}</Badge>
                  <Badge className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-600 text-[10px] capitalize">{c.dialing_mode}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {(c.status === "draft" || c.status === "paused" || c.status === "scheduled") && (
                    <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => action(c.id, "start")} data-testid={`start-campaign-${c.id}`}>
                      <Play size={13} className="mr-1" /> Start
                    </Button>
                  )}
                  {c.status === "running" && (
                    <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => action(c.id, "pause")} data-testid={`pause-campaign-${c.id}`}>
                      <Pause size={13} className="mr-1" /> Pause
                    </Button>
                  )}
                  <button onClick={() => del(c.id)} className="p-1.5 text-zinc-400 hover:text-red-600" data-testid={`delete-campaign-${c.id}`}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <Progress value={pct} className="h-2 rounded-sm flex-1" />
                <span className="text-xs font-mono text-zinc-500 w-40 text-right">
                  {done}/{c.stats.total} done · {c.stats.dialing} dialing · {c.stats.queued + c.stats.retry_scheduled} pending
                </span>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Window {c.call_window_start}–{c.call_window_end} ({c.timezone}) · pacing {c.pacing_seconds}s · retries {c.max_retries} · concurrency {c.max_concurrent}
                {c.scheduled_at && ` · scheduled ${fmtDate(c.scheduled_at)}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="campaign-create-dialog">
          <DialogHeader><DialogTitle className="font-heading">New Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 rounded-sm" data-testid="campaign-name-input" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Persona</Label>
                <Select value={form.persona_id} onValueChange={(v) => setForm({ ...form, persona_id: v })}>
                  <SelectTrigger className="mt-1.5 rounded-sm" data-testid="campaign-persona-select"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{personas.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.role}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Dialing Mode</Label>
              <Select value={form.dialing_mode} onValueChange={(v) => setForm({ ...form, dialing_mode: v })}>
                <SelectTrigger className="mt-1.5 rounded-sm" data-testid="campaign-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[["max_concurrent", "Concurrency"], ["pacing_seconds", "Pacing (s)"], ["max_retries", "Retries"], ["retry_delay_minutes", "Retry delay (m)"]].map(([k, l]) => (
                <div key={k}>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">{l}</Label>
                  <Input type="number" min="0" value={form[k]} onChange={(e) => setForm({ ...form, [k]: parseInt(e.target.value) || 0 })}
                    className="mt-1.5 rounded-sm font-mono" data-testid={`campaign-${k}-input`} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Window start</Label>
                <Input type="time" value={form.call_window_start} onChange={(e) => setForm({ ...form, call_window_start: e.target.value })} className="mt-1.5 rounded-sm" data-testid="campaign-window-start" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Window end</Label>
                <Input type="time" value={form.call_window_end} onChange={(e) => setForm({ ...form, call_window_end: e.target.value })} className="mt-1.5 rounded-sm" data-testid="campaign-window-end" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Timezone</Label>
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="mt-1.5 rounded-sm font-mono" data-testid="campaign-timezone-input" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Schedule start (optional — leave empty to start manually)</Label>
              <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} className="mt-1.5 rounded-sm" data-testid="campaign-schedule-input" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Contacts — one per line: Name,Phone</Label>
                <Button size="sm" variant="outline" className="rounded-sm h-7 text-xs" onClick={importCrm} data-testid="campaign-import-crm-button">
                  <Upload size={12} className="mr-1" /> Import from CRM
                </Button>
              </div>
              <Textarea rows={6} value={form.contactsText} onChange={(e) => setForm({ ...form, contactsText: e.target.value })}
                placeholder={"Shruti Sharma,+919876543210\nRahul Verma,+919812345678"}
                className="mt-1.5 rounded-sm font-mono text-xs" data-testid="campaign-contacts-input" />
            </div>
            <Button onClick={create} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="campaign-save-button">Create Campaign</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="rounded-sm max-w-xl max-h-[80vh] overflow-y-auto" data-testid="campaign-detail-dialog">
          {detail && (
            <>
              <DialogHeader><DialogTitle className="font-heading">{detail.name} — Contact Status</DialogTitle></DialogHeader>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 text-left">
                  <th className="py-2 text-[10px] uppercase tracking-wider text-zinc-500">Name</th>
                  <th className="py-2 text-[10px] uppercase tracking-wider text-zinc-500">Phone</th>
                  <th className="py-2 text-[10px] uppercase tracking-wider text-zinc-500">Status</th>
                  <th className="py-2 text-[10px] uppercase tracking-wider text-zinc-500">Attempts</th>
                </tr></thead>
                <tbody>
                  {detail.contacts.map((cc) => (
                    <tr key={cc.id} className="border-b border-slate-100">
                      <td className="py-2">{cc.name || "—"}</td>
                      <td className="py-2 font-mono">{cc.phone}</td>
                      <td className="py-2"><Badge className={`rounded-sm border text-[10px] ${cc.status === "completed" ? STATUS_COLORS.completed : cc.status === "failed" ? STATUS_COLORS.failed : STATUS_COLORS.initiated}`}>{cc.status}</Badge></td>
                      <td className="py-2 font-mono">{cc.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
