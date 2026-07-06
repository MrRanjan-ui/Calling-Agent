import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api, LEAD_COLORS } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

export default function Pipelines() {
  const [pipelines, setPipelines] = useState([]);
  const [selected, setSelected] = useState("");
  const [board, setBoard] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [stagesText, setStagesText] = useState("New, Contacted, Qualified, Proposal, Won, Lost");
  const [dragOver, setDragOver] = useState("");

  const loadPipelines = useCallback(async () => {
    const r = await api.get("/pipelines");
    setPipelines(r.data);
    if (r.data.length && !selected) setSelected(r.data[0].id);
  }, [selected]);

  const loadBoard = useCallback(() => {
    if (selected) api.get(`/pipelines/${selected}/board`).then((r) => setBoard(r.data));
  }, [selected]);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  const create = async () => {
    if (!name.trim()) return toast.error("Pipeline name required");
    const stages = stagesText.split(",").map((s) => s.trim()).filter(Boolean);
    const r = await api.post("/pipelines", { name, stages });
    toast.success("Pipeline created");
    setCreating(false);
    setName("");
    await loadPipelines();
    setSelected(r.data.id);
  };

  const delPipeline = async () => {
    await api.delete(`/pipelines/${selected}`);
    setSelected("");
    setBoard(null);
    loadPipelines();
  };

  const onDrop = async (e, stageId) => {
    e.preventDefault();
    setDragOver("");
    const contactId = e.dataTransfer.getData("contactId");
    if (!contactId) return;
    await api.post("/pipelines/move", { contact_id: contactId, pipeline_id: selected, stage_id: stageId });
    loadBoard();
  };

  const Card = ({ c }) => (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("contactId", c.id)}
      className="kanban-card bg-white border border-slate-200 p-3 rounded-sm" data-testid={`kanban-card-${c.id}`}>
      <div className="flex items-center gap-2">
        {c.avatar ? <img src={c.avatar} alt="" className="w-6 h-6 rounded-sm object-cover" /> :
          <div className="w-6 h-6 rounded-sm bg-[#002FA7] text-white flex items-center justify-center text-[10px] font-bold">{(c.name || "?")[0]}</div>}
        <div className="text-xs font-medium truncate">{c.name}</div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <Badge className={`rounded-sm border text-[9px] capitalize ${LEAD_COLORS[c.lead_status] || ""}`}>{c.lead_status}</Badge>
        <span className="text-[10px] font-mono text-zinc-500">₹{(c.lifetime_value || 0).toLocaleString()}</span>
      </div>
      {c.company && <div className="text-[10px] text-zinc-500 mt-1">{c.company}</div>}
    </div>
  );

  return (
    <div className="p-8 h-full flex flex-col" data-testid="pipelines-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Pipelines</h1>
          <p className="text-sm text-zinc-500 mt-1">Drag & drop leads across stages — multiple pipelines supported</p>
        </div>
        <div className="flex gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-48 rounded-sm" data-testid="pipeline-select"><SelectValue placeholder="Select pipeline" /></SelectTrigger>
            <SelectContent>{pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => setCreating(true)} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="create-pipeline-button">
            <Plus size={15} className="mr-1.5" /> New Pipeline
          </Button>
          {selected && <Button variant="outline" size="icon" className="rounded-sm" onClick={delPipeline} data-testid="delete-pipeline-button"><Trash2 size={14} /></Button>}
        </div>
      </div>

      {board && (
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
          <div className={`w-72 shrink-0 bg-slate-50 border border-slate-200 p-3 rounded-sm ${dragOver === "unassigned" ? "kanban-col-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver("unassigned"); }} onDragLeave={() => setDragOver("")}
            onDrop={(e) => onDrop(e, "")} data-testid="kanban-col-unassigned">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-3">Unassigned ({board.unassigned.length})</div>
            <div className="space-y-2">{board.unassigned.map((c) => <Card key={c.id} c={c} />)}</div>
          </div>
          {board.columns.map((col) => (
            <div key={col.stage.id} className={`w-72 shrink-0 bg-slate-50 border border-slate-200 p-3 rounded-sm ${dragOver === col.stage.id ? "kanban-col-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.stage.id); }} onDragLeave={() => setDragOver("")}
              onDrop={(e) => onDrop(e, col.stage.id)} data-testid={`kanban-col-${col.stage.name.toLowerCase()}`}>
              <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-3">{col.stage.name} ({col.cards.length})</div>
              <div className="space-y-2 min-h-24">{col.cards.map((c) => <Card key={c.id} c={c} />)}</div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-sm" data-testid="pipeline-create-dialog">
          <DialogHeader><DialogTitle className="font-heading">New Pipeline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 rounded-sm" data-testid="pipeline-name-input" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Stages (comma separated)</Label>
              <Input value={stagesText} onChange={(e) => setStagesText(e.target.value)} className="mt-1.5 rounded-sm" data-testid="pipeline-stages-input" />
            </div>
            <Button onClick={create} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="pipeline-save-button">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
