import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PhoneOutgoing } from "lucide-react";
import { api } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export default function NewCallDialog({ defaultPhone = "", trigger }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);
  const [personaId, setPersonaId] = useState("");
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(defaultPhone);
      api.get("/personas").then((r) => {
        setPersonas(r.data);
        const def = r.data.find((p) => p.is_default) || r.data[0];
        if (def) setPersonaId(def.id);
      });
    }
  }, [open, defaultPhone]);

  const makeCall = async () => {
    if (!phone.trim()) return toast.error("Enter a phone number");
    setLoading(true);
    try {
      await api.post("/calls/outbound", { to_number: phone.trim(), persona_id: personaId });
      toast.success("Call initiated! Track it in Call Logs.");
      setOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to initiate call");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="w-full bg-[#002FA7] hover:bg-[#002080] text-white rounded-sm" data-testid="new-call-button">
            <PhoneOutgoing size={15} className="mr-2" /> New Call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-sm border-slate-200" data-testid="new-call-dialog">
        <DialogHeader><DialogTitle className="font-heading">Start Outbound Call</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Phone Number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210"
              className="mt-1.5 rounded-sm font-mono" data-testid="call-phone-input" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Persona</Label>
            <Select value={personaId} onValueChange={setPersonaId}>
              <SelectTrigger className="mt-1.5 rounded-sm" data-testid="call-persona-select"><SelectValue placeholder="Select persona" /></SelectTrigger>
              <SelectContent>
                {personas.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.role}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={makeCall} disabled={loading} className="w-full bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="call-submit-button">
            {loading ? "Dialing..." : "Call Now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
