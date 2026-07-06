import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, Clock, Users, Megaphone, CheckCircle2, PhoneMissed } from "lucide-react";
import { api, fmtDate, fmtDuration, STATUS_COLORS } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { useNavigate } from "react-router-dom";

const Stat = ({ icon: Icon, label, value, sub, testid }) => (
  <div className="border border-slate-200 rounded-sm p-5 bg-white h-full" data-testid={testid}>
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">{label}</span>
      <Icon size={16} className="text-[#002FA7]" aria-hidden="true" />
    </div>
    <div className="mt-3 text-3xl font-heading font-black">{value}</div>
    {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const load = () => api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return <div className="p-8 text-zinc-500">Loading dashboard…</div>;

  const leadData = Object.entries(stats.lead_counts || {}).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="p-8" data-testid="dashboard-page">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Live overview of your AI calling operations</p>
        </div>
        {stats.active_calls > 0 && (
          <Badge className="bg-green-100 text-green-800 border border-green-200 rounded-sm animate-pulse" data-testid="active-calls-badge">
            ● {stats.active_calls} live call{stats.active_calls > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon={PhoneCall} label="Total Calls" value={stats.total_calls} sub={`${stats.completed} completed · ${stats.failed} failed`} testid="stat-total-calls" />
        <Stat icon={CheckCircle2} label="Success Rate" value={`${stats.success_rate}%`} sub={`avg ${fmtDuration(stats.avg_duration_seconds)} per call`} testid="stat-success-rate" />
        <Stat icon={Clock} label="Talk Minutes" value={stats.total_minutes} sub="total AI conversation time" testid="stat-minutes" />
        <Stat icon={Users} label="Contacts" value={stats.contacts} sub={`${stats.pending_callbacks} pending callbacks`} testid="stat-contacts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 border border-slate-200 rounded-sm p-5 bg-white">
          <div className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-4">Call Volume — Last 7 Days</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.daily_volume}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 2, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="calls" fill="#002FA7" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="border border-slate-200 rounded-sm p-5 bg-white">
          <div className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-4">Lead Funnel</div>
          <div className="space-y-2.5">
            {leadData.map((l) => (
              <div key={l.name} className="flex items-center gap-3">
                <span className="text-xs w-20 capitalize text-zinc-600">{l.name}</span>
                <div className="flex-1 bg-slate-100 h-4 rounded-sm overflow-hidden">
                  <div className="h-full bg-[#002FA7]" style={{ width: `${stats.contacts ? (l.value / stats.contacts) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-mono w-6 text-right">{l.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat icon={PhoneIncoming} label="Inbound" value={stats.inbound} testid="stat-inbound" />
        <Stat icon={PhoneOutgoing} label="Outbound" value={stats.outbound} testid="stat-outbound" />
        <Stat icon={Megaphone} label="Running Campaigns" value={stats.campaigns_running} testid="stat-campaigns" />
      </div>

      <div className="border border-slate-200 rounded-sm bg-white">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <span className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-semibold">Recent Calls</span>
          <button onClick={() => nav("/calls")} className="text-xs text-[#002FA7] hover:underline" data-testid="view-all-calls-link">View all →</button>
        </div>
        {stats.recent_calls.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            <PhoneMissed className="mx-auto mb-2" size={20} />No calls yet. Start your first call from the sidebar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {stats.recent_calls.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => nav("/calls")}>
                  <td className="px-5 py-3">{c.direction === "inbound" ? <PhoneIncoming size={14} className="text-green-600" /> : <PhoneOutgoing size={14} className="text-[#002FA7]" />}</td>
                  <td className="px-2 py-3 font-mono text-xs">{c.direction === "inbound" ? c.from_number : c.to_number}</td>
                  <td className="px-2 py-3 text-zinc-600">{c.persona_name}</td>
                  <td className="px-2 py-3"><Badge className={`rounded-sm border text-[10px] ${STATUS_COLORS[c.status] || STATUS_COLORS.initiated}`}>{c.status}</Badge></td>
                  <td className="px-2 py-3 font-mono text-xs">{fmtDuration(c.duration_seconds)}</td>
                  <td className="px-5 py-3 text-xs text-zinc-500 text-right">{fmtDate(c.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
