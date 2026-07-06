import { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { LayoutGrid, PhoneCall, Users, Megaphone, Contact, Kanban, BookOpen, Wrench, Settings as SettingsIcon, AudioWaveform } from "lucide-react";
import { api } from "../lib/api";
import NewCallDialog from "./NewCallDialog";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/calls", label: "Call Logs", icon: PhoneCall },
  { to: "/personas", label: "Personas", icon: Users },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/contacts", label: "Contacts", icon: Contact },
  { to: "/pipelines", label: "Pipelines", icon: Kanban },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Layout() {
  const [brand, setBrand] = useState({ brand_name: "VoxFlow", brand_tagline: "AI Call Automation" });

  useEffect(() => {
    api.get("/settings").then((r) => setBrand(r.data)).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-white text-zinc-950">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col" data-testid="sidebar">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-200">
          <div className="w-8 h-8 bg-[#002FA7] flex items-center justify-center">
            <AudioWaveform className="w-4.5 h-4.5 text-white" size={18} />
          </div>
          <div>
            <div className="font-heading font-black text-base leading-none" data-testid="brand-name">{brand.brand_name || "VoxFlow"}</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-0.5">{brand.brand_tagline || "AI Call Automation"}</div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-all duration-150 ${
                  isActive ? "bg-[#002FA7] text-white font-medium" : "text-zinc-600 hover:bg-slate-100 hover:text-zinc-950"}`}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <NewCallDialog />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
