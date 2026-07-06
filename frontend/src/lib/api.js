import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const api = axios.create({ baseURL: `${BACKEND_URL}/api` });

export const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

export const fmtDuration = (s) => {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

export const STATUS_COLORS = {
  completed: "bg-green-100 text-green-800 border-green-200",
  "in-progress": "bg-blue-100 text-blue-800 border-blue-200",
  answered: "bg-blue-100 text-blue-800 border-blue-200",
  ringing: "bg-yellow-100 text-yellow-800 border-yellow-200",
  initiated: "bg-slate-100 text-slate-800 border-slate-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  running: "bg-green-100 text-green-800 border-green-200",
  paused: "bg-yellow-100 text-yellow-800 border-yellow-200",
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  draft: "bg-slate-100 text-slate-800 border-slate-200",
};

export const LEAD_COLORS = {
  new: "bg-slate-100 text-slate-800 border-slate-200",
  contacted: "bg-blue-100 text-blue-800 border-blue-200",
  qualified: "bg-indigo-100 text-indigo-800 border-indigo-200",
  proposal: "bg-yellow-100 text-yellow-800 border-yellow-200",
  won: "bg-green-100 text-green-800 border-green-200",
  lost: "bg-red-100 text-red-800 border-red-200",
};
