import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Calendar, Save } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const Section = ({ title, children }) => (
  <div className="border border-slate-200 rounded-sm bg-white">
    <div className="px-5 py-3 border-b border-slate-200 text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">{title}</div>
    <div className="p-5 space-y-4">{children}</div>
  </div>
);

const Field = ({ label, value, onChange, type = "text", placeholder = "", mono = true, testid }) => (
  <div>
    <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">{label}</Label>
    <Input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`mt-1.5 rounded-sm ${mono ? "font-mono text-xs" : ""}`} data-testid={testid} />
  </div>
);

export default function Settings() {
  const [s, setS] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [webhooks, setWebhooks] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data));
    api.get("/personas").then((r) => setPersonas(r.data));
    api.get("/settings/webhook-info").then((r) => setWebhooks(r.data));
  }, []);

  const save = async () => {
    const r = await api.put("/settings", s);
    setS(r.data);
    toast.success("Settings saved — applied to all future calls instantly");
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const connectGoogle = async () => {
    await save();
    const r = await api.get("/google/auth-url");
    if (r.data.url) window.location.href = r.data.url;
    else toast.error(r.data.error || "Set Google credentials first");
  };

  if (!s) return <div className="p-8 text-zinc-500">Loading…</div>;
  const set = (k) => (v) => setS({ ...s, [k]: v });

  return (
    <div className="p-8 max-w-3xl" data-testid="settings-page">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Client workspace configuration — changes apply in real time</p>
        </div>
        <Button onClick={save} className="bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="save-settings-button">
          <Save size={14} className="mr-1.5" /> Save All
        </Button>
      </div>

      <div className="space-y-5">
        <Section title="Branding">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand Name" value={s.brand_name} onChange={set("brand_name")} mono={false} testid="setting-brand-name" />
            <Field label="Tagline" value={s.brand_tagline} onChange={set("brand_tagline")} mono={false} testid="setting-brand-tagline" />
          </div>
        </Section>

        <Section title="Vobiz Telephony">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Auth ID" value={s.vobiz_auth_id} onChange={set("vobiz_auth_id")} testid="setting-vobiz-id" />
            <Field label="Auth Token" value={s.vobiz_auth_token} onChange={set("vobiz_auth_token")} testid="setting-vobiz-token" />
          </div>
          <Field label="From Number" value={s.vobiz_from_number} onChange={set("vobiz_from_number")} placeholder="+917971441957" testid="setting-vobiz-number" />
          {webhooks && (
            <div className="bg-slate-50 border border-slate-200 rounded-sm p-3 space-y-2">
              <div className="text-xs font-semibold text-zinc-600">Configure these on your Vobiz number for inbound calls:</div>
              {[["Answer URL", webhooks.inbound_answer_url], ["Hangup URL", webhooks.hangup_url]].map(([l, u]) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-20">{l}</span>
                  <code className="flex-1 text-[11px] font-mono bg-white border border-slate-200 rounded-sm px-2 py-1 truncate">{u}</code>
                  <button onClick={() => copy(u)} className="text-zinc-400 hover:text-[#002FA7]" data-testid={`copy-${l.toLowerCase().replace(" ", "-")}`}><Copy size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Gemini Voice AI">
          <Field label="API Key" value={s.gemini_api_key} onChange={set("gemini_api_key")} testid="setting-gemini-key" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Realtime Model" value={s.gemini_model} onChange={set("gemini_model")} testid="setting-gemini-model" />
            <Field label="Summary Model" value={s.summary_model} onChange={set("summary_model")} testid="setting-summary-model" />
          </div>
        </Section>

        <Section title="Inbound Call Routing">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Default Inbound Persona (AI Receptionist)</Label>
            <Select value={s.default_inbound_persona_id || "auto"} onValueChange={(v) => setS({ ...s, default_inbound_persona_id: v === "auto" ? "" : v })}>
              <SelectTrigger className="mt-1.5 rounded-sm" data-testid="setting-inbound-persona"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (persona marked default)</SelectItem>
                {personas.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.role}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Connecting message</div>
              <div className="text-xs text-zinc-500">Play "please wait" prompt before AI joins inbound calls</div>
            </div>
            <Switch checked={s.inbound_greeting_enabled} onCheckedChange={set("inbound_greeting_enabled")} data-testid="setting-inbound-greeting" />
          </div>
          <Field label="Business Timezone" value={s.timezone} onChange={set("timezone")} testid="setting-timezone" />
        </Section>

        <Section title="Google Calendar">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-[#002FA7]" />
            <span className="text-sm">Status:</span>
            <Badge className={`rounded-sm border text-[10px] ${s.google_connected ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {s.google_connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Google Client ID" value={s.google_client_id} onChange={set("google_client_id")} testid="setting-google-id" />
            <Field label="Google Client Secret" value={s.google_client_secret} onChange={set("google_client_secret")} testid="setting-google-secret" />
          </div>
          <p className="text-xs text-zinc-500">Create OAuth credentials at console.cloud.google.com → APIs → Credentials. Add redirect URI: <code className="font-mono bg-slate-50 px-1">{(webhooks?.inbound_answer_url || "").replace("/api/telephony/inbound", "/api/google/callback")}</code></p>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-sm" onClick={connectGoogle} data-testid="google-connect-button">Connect Google Calendar</Button>
            {s.google_connected && <Button variant="outline" className="rounded-sm text-red-600" onClick={async () => { await api.post("/google/disconnect"); setS({ ...s, google_connected: false }); }} data-testid="google-disconnect-button">Disconnect</Button>}
          </div>
        </Section>
      </div>
    </div>
  );
}
