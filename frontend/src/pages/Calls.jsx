import { useState, useEffect, useCallback } from "react";
import { PhoneIncoming, PhoneOutgoing, Trash2, RefreshCw, Bot } from "lucide-react";
import { toast } from "sonner";
import { api, BACKEND_URL, fmtDate, fmtDuration, STATUS_COLORS } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

export default function Calls() {
  const [calls, setCalls] = useState([]);
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (direction !== "all") params.direction = direction;
    if (status !== "all") params.status = status;
    api.get("/calls", { params }).then((r) => setCalls(r.data));
  }, [direction, status]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const openDetail = (id) => api.get(`/calls/${id}`).then((r) => setDetail(r.data));

  const del = async (e, id) => {
    e.stopPropagation();
    await api.delete(`/calls/${id}`);
    toast.success("Call deleted");
    load();
  };

  return (
    <div className="p-8" data-testid="calls-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Call Logs</h1>
          <p className="text-sm text-zinc-500 mt-1">Transcripts, recordings & AI summaries for every call</p>
        </div>
        <div className="flex gap-2">
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-32 rounded-sm" data-testid="filter-direction"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36 rounded-sm" data-testid="filter-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in-progress">In progress</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="rounded-sm" onClick={load} data-testid="refresh-calls-button"><RefreshCw size={14} /></Button>
        </div>
      </div>

      <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              {["", "Number", "Persona", "Status", "Outcome", "Duration", "Started", ""].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-zinc-400 text-sm">No calls found</td></tr>
            )}
            {calls.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(c.id)} data-testid={`call-row-${c.id}`}>
                <td className="px-4 py-3">{c.direction === "inbound" ? <PhoneIncoming size={14} className="text-green-600" /> : <PhoneOutgoing size={14} className="text-[#002FA7]" />}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.direction === "inbound" ? c.from_number : c.to_number}</td>
                <td className="px-4 py-3 text-zinc-600">{c.persona_name || "—"}</td>
                <td className="px-4 py-3"><Badge className={`rounded-sm border text-[10px] ${STATUS_COLORS[c.status] || STATUS_COLORS.initiated}`}>{c.status}</Badge></td>
                <td className="px-4 py-3 text-xs text-zinc-600 max-w-[180px] truncate">{c.outcome || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{fmtDuration(c.duration_seconds)}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{fmtDate(c.started_at)}</td>
                <td className="px-4 py-3"><button onClick={(e) => del(e, c.id)} className="text-zinc-400 hover:text-red-600" data-testid={`delete-call-${c.id}`}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="rounded-sm max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="call-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  {detail.direction === "inbound" ? <PhoneIncoming size={16} /> : <PhoneOutgoing size={16} />}
                  {detail.direction === "inbound" ? detail.from_number : detail.to_number}
                  <Badge className={`rounded-sm border text-[10px] ml-2 ${STATUS_COLORS[detail.status] || ""}`}>{detail.status}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="border border-slate-200 rounded-sm p-3"><div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Persona</div><div className="mt-1 font-medium">{detail.persona_name}</div></div>
                <div className="border border-slate-200 rounded-sm p-3"><div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Duration</div><div className="mt-1 font-mono">{fmtDuration(detail.duration_seconds)}</div></div>
                <div className="border border-slate-200 rounded-sm p-3"><div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">Sentiment</div><div className="mt-1 capitalize">{detail.sentiment || "—"}</div></div>
              </div>
              {detail.recording_url && (
                <div className="border border-slate-200 rounded-sm p-3">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold mb-2">Recording</div>
                  <audio controls className="w-full h-10" src={`${BACKEND_URL}${detail.recording_url}`} data-testid="call-recording-player" />
                </div>
              )}
              {detail.summary && (
                <div className="border border-slate-200 rounded-sm p-3 bg-slate-50">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold mb-1.5">AI Summary {detail.outcome && <span className="text-[#002FA7]">· {detail.outcome}</span>}</div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="call-summary">{detail.summary}</p>
                </div>
              )}
              {detail.tool_calls?.length > 0 && (
                <div className="border border-slate-200 rounded-sm p-3">
                  <div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold mb-2">Tools Used</div>
                  {detail.tool_calls.map((tc, i) => (
                    <div key={i} className="font-mono text-xs py-1 border-b border-slate-100 last:border-0">
                      <span className="text-[#002FA7]">{tc.name}</span>({JSON.stringify(tc.args)})
                    </div>
                  ))}
                </div>
              )}
              <div className="border border-slate-200 rounded-sm p-3">
                <div className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold mb-3">Transcript</div>
                {(!detail.transcript || detail.transcript.length === 0) && <div className="text-xs text-zinc-400">No transcript captured</div>}
                <div className="space-y-2 max-h-72 overflow-y-auto" data-testid="call-transcript">
                  {(detail.transcript || []).map((t, i) => (
                    <div key={i} className={`flex gap-2 ${t.role === "agent" ? "" : "flex-row-reverse"}`}>
                      <div className={`max-w-[75%] px-3 py-1.5 text-xs rounded-sm ${t.role === "agent" ? "bg-slate-100" : "bg-[#002FA7] text-white"}`}>
                        {t.role === "agent" && <Bot size={10} className="inline mr-1 -mt-0.5" />}{t.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {detail.error && <div className="text-xs text-red-600 font-mono">Error: {detail.error}</div>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
