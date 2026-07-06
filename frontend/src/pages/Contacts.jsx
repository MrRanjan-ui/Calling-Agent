import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, PhoneOutgoing, PhoneIncoming } from "lucide-react";
import { api, fmtDate, fmtDuration, LEAD_COLORS, STATUS_COLORS } from "../lib/api";
import NewCallDialog from "../components/NewCallDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"];
const EMPTY = { name: "", phone: "", email: "", company: "", lead_status: "new", lifetime_value: 0, tags: [], custom_fields: {} };

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [noteText, setNoteText] = useState("");
  const [newTag, setNewTag] = useState("");
  const [cfKey, setCfKey] = useState("");
  const [cfVal, setCfVal] = useState("");

  const load = useCallback(() => {
    const params = {};
    if (search) params.search = search;
    if (leadFilter !== "all") params.lead_status = leadFilter;
    api.get("/contacts", { params }).then((r) => setContacts(r.data));
  }, [search, leadFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = (id) => api.get(`/contacts/${id}`).then((r) => setDetail(r.data));

  const saveNew = async () => {
    if (!form.name.trim() && !form.phone.trim()) return toast.error("Name or phone required");
    await api.post("/contacts", form);
    toast.success("Contact created");
    setCreating(false);
    setForm(EMPTY);
    load();
  };

  const patchDetail = async (patch) => {
    const r = await api.put(`/contacts/${detail.id}`, patch);
    setDetail({ ...detail, ...r.data });
    load();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await api.post(`/contacts/${detail.id}/notes`, { text: noteText });
    setNoteText("");
    openDetail(detail.id);
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    await patchDetail({ tags: [...(detail.tags || []), newTag.trim()] });
    setNewTag("");
  };

  const addCustomField = async () => {
    if (!cfKey.trim()) return;
    await patchDetail({ custom_fields: { ...(detail.custom_fields || {}), [cfKey.trim()]: cfVal } });
    setCfKey(""); setCfVal("");
  };

  const del = async (e, id) => {
    e.stopPropagation();
    await api.delete(`/contacts/${id}`);
    load();
  };

  return (
    <div className="p-8" data-testid="contacts-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Contacts</h1>
          <p className="text-sm text-zinc-500 mt-1">CRM — every call automatically updates these records</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="create-contact-button">
          <Plus size={15} className="mr-1.5" /> New Contact
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, company…" className="pl-9 rounded-sm" data-testid="contact-search-input" />
        </div>
        <Select value={leadFilter} onValueChange={setLeadFilter}>
          <SelectTrigger className="w-36 rounded-sm" data-testid="contact-lead-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              {["Name", "Phone", "Company", "Lead Status", "Tags", "LTV", "Calls", "Last Contact", ""].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(c.id)} data-testid={`contact-row-${c.id}`}>
                <td className="px-4 py-3 font-medium flex items-center gap-2">
                  {c.avatar ? <img src={c.avatar} alt="" className="w-7 h-7 rounded-sm object-cover" /> :
                    <div className="w-7 h-7 rounded-sm bg-[#002FA7] text-white flex items-center justify-center text-xs font-bold">{(c.name || "?")[0]}</div>}
                  {c.name}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3 text-zinc-600">{c.company || "—"}</td>
                <td className="px-4 py-3"><Badge className={`rounded-sm border text-[10px] capitalize ${LEAD_COLORS[c.lead_status] || ""}`}>{c.lead_status}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">{(c.tags || []).slice(0, 2).map((t) => <Badge key={t} className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-600 text-[9px]">{t}</Badge>)}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">₹{(c.lifetime_value || 0).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.total_calls || 0}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{c.last_contacted_at ? fmtDate(c.last_contacted_at) : "—"}</td>
                <td className="px-4 py-3"><button onClick={(e) => del(e, c.id)} className="text-zinc-400 hover:text-red-600" data-testid={`delete-contact-${c.id}`}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-sm" data-testid="contact-create-dialog">
          <DialogHeader><DialogTitle className="font-heading">New Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[["name", "Name"], ["phone", "Phone"], ["email", "Email"], ["company", "Company"]].map(([k, l]) => (
              <div key={k}>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">{l}</Label>
                <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1.5 rounded-sm" data-testid={`contact-${k}-input`} />
              </div>
            ))}
            <Button onClick={saveNew} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="contact-save-button">Create Contact</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="rounded-sm max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="contact-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center justify-between pr-6">
                  <span>{detail.name}</span>
                  <NewCallDialog defaultPhone={detail.phone} trigger={
                    <Button size="sm" className="bg-[#002FA7] hover:bg-[#002080] rounded-sm h-8" data-testid="contact-call-button">
                      <PhoneOutgoing size={13} className="mr-1.5" /> Call
                    </Button>} />
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                {[["phone", "Phone"], ["email", "Email"], ["company", "Company"]].map(([k, l]) => (
                  <div key={k}>
                    <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">{l}</Label>
                    <Input defaultValue={detail[k]} onBlur={(e) => e.target.value !== detail[k] && patchDetail({ [k]: e.target.value })} className="mt-1 rounded-sm" data-testid={`detail-${k}-input`} />
                  </div>
                ))}
                <div>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Lifetime Value (₹)</Label>
                  <Input type="number" defaultValue={detail.lifetime_value} onBlur={(e) => patchDetail({ lifetime_value: parseFloat(e.target.value) || 0 })} className="mt-1 rounded-sm font-mono" data-testid="detail-ltv-input" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Lead Status</Label>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {LEAD_STATUSES.map((s) => (
                      <button key={s} onClick={() => patchDetail({ lead_status: s })}
                        className={`px-2.5 py-1 text-xs capitalize border rounded-sm transition-all duration-150 ${detail.lead_status === s ? "bg-[#002FA7] text-white border-[#002FA7]" : "border-slate-200 text-zinc-600 hover:bg-slate-50"}`}
                        data-testid={`lead-status-${s}`}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Tags</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                  {(detail.tags || []).map((t) => (
                    <Badge key={t} className="rounded-sm border border-slate-200 bg-slate-50 text-zinc-700 text-[10px] cursor-pointer hover:bg-red-50"
                      onClick={() => patchDetail({ tags: detail.tags.filter((x) => x !== t) })}>{t} ✕</Badge>
                  ))}
                  <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()}
                    placeholder="+ tag" className="rounded-sm h-7 w-24 text-xs" data-testid="add-tag-input" />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Custom Fields</Label>
                <div className="mt-1.5 space-y-1">
                  {Object.entries(detail.custom_fields || {}).map(([k, v]) => (
                    <div key={k} className="flex text-xs gap-2 items-center">
                      <span className="font-mono font-medium w-32">{k}</span><span className="flex-1">{v}</span>
                      <button className="text-zinc-400 hover:text-red-600" onClick={() => { const cf = { ...detail.custom_fields }; delete cf[k]; patchDetail({ custom_fields: cf }); }}>✕</button>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <Input value={cfKey} onChange={(e) => setCfKey(e.target.value)} placeholder="Field" className="rounded-sm h-7 w-32 text-xs" data-testid="cf-key-input" />
                    <Input value={cfVal} onChange={(e) => setCfVal(e.target.value)} placeholder="Value" className="rounded-sm h-7 flex-1 text-xs" data-testid="cf-value-input" />
                    <Button size="sm" variant="outline" className="rounded-sm h-7 text-xs" onClick={addCustomField} data-testid="cf-add-button">Add</Button>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Notes</Label>
                <div className="mt-1.5 space-y-1.5 max-h-36 overflow-y-auto">
                  {(detail.notes || []).slice().reverse().map((n) => (
                    <div key={n.id} className="text-xs bg-slate-50 border border-slate-200 rounded-sm p-2">
                      {n.text}<div className="text-[10px] text-zinc-400 mt-0.5">{fmtDate(n.created_at)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                  <Textarea rows={1} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add note…" className="rounded-sm text-xs" data-testid="add-note-input" />
                  <Button size="sm" variant="outline" className="rounded-sm" onClick={addNote} data-testid="add-note-button">Add</Button>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Previous Interactions ({(detail.interactions || []).length})</Label>
                <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                  {(detail.interactions || []).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs border border-slate-200 rounded-sm p-2">
                      {c.direction === "inbound" ? <PhoneIncoming size={12} className="text-green-600" /> : <PhoneOutgoing size={12} className="text-[#002FA7]" />}
                      <Badge className={`rounded-sm border text-[9px] ${STATUS_COLORS[c.status] || ""}`}>{c.status}</Badge>
                      <span className="flex-1 truncate text-zinc-600">{c.outcome || c.summary?.slice(0, 60) || "—"}</span>
                      <span className="font-mono text-zinc-400">{fmtDuration(c.duration_seconds)}</span>
                      <span className="text-zinc-400">{fmtDate(c.started_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
