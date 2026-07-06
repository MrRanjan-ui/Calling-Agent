import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, PhoneOff, Bot, Wrench } from "lucide-react";
import { BACKEND_URL } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

function int16ToB64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(bin);
}

function b64ToFloat32(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
  return f32;
}

function downsample(f32, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const out = new Int16Array(Math.floor(f32.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[Math.floor(i * ratio)]));
    out[i] = s * 32767;
  }
  return out;
}

export default function WebCallDialog({ persona, open, onClose }) {
  const [status, setStatus] = useState("idle"); // idle|connecting|live|ended|error
  const [lines, setLines] = useState([]);
  const [errMsg, setErrMsg] = useState("");
  const wsRef = useRef(null);
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const procRef = useRef(null);
  const cursorRef = useRef(0);
  const sourcesRef = useRef([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const cleanup = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    try { procRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctxRef.current?.close(); } catch {}
    wsRef.current = null; ctxRef.current = null; streamRef.current = null; procRef.current = null;
    sourcesRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const stopPlayback = () => {
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    sourcesRef.current = [];
    if (ctxRef.current) cursorRef.current = ctxRef.current.currentTime;
  };

  const playChunk = (f32, rate) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const buf = ctx.createBuffer(1, f32.length, rate);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.05, cursorRef.current);
    src.start(startAt);
    cursorRef.current = startAt + buf.duration;
    sourcesRef.current.push(src);
    if (sourcesRef.current.length > 60) sourcesRef.current = sourcesRef.current.slice(-40);
  };

  const start = async () => {
    setLines([]); setErrMsg("");
    setStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      cursorRef.current = 0;

      const wsUrl = `${BACKEND_URL.replace("https:", "wss:").replace("http:", "ws:")}/api/browser/stream?persona_id=${persona.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.event === "ready") {
          setStatus("live");
          const source = ctx.createMediaStreamSource(stream);
          const proc = ctx.createScriptProcessor(4096, 1, 1);
          procRef.current = proc;
          const mute = ctx.createGain();
          mute.gain.value = 0;
          source.connect(proc);
          proc.connect(mute);
          mute.connect(ctx.destination);
          proc.onaudioprocess = (ev) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const pcm16 = downsample(ev.inputBuffer.getChannelData(0), ctx.sampleRate, 16000);
            ws.send(JSON.stringify({ event: "media", payload: int16ToB64(pcm16) }));
          };
        } else if (msg.event === "audio") {
          playChunk(b64ToFloat32(msg.payload), msg.sampleRate || 24000);
        } else if (msg.event === "transcript") {
          setLines((l) => [...l, { role: msg.role, text: msg.text }]);
        } else if (msg.event === "tool") {
          setLines((l) => [...l, { role: "tool", text: `${msg.name}(${JSON.stringify(msg.args)})` }]);
        } else if (msg.event === "interrupted") {
          stopPlayback();
        } else if (msg.event === "error") {
          setErrMsg(msg.message);
          setStatus("error");
        }
      };
      ws.onclose = () => setStatus((s) => (s === "error" ? s : "ended"));
      ws.onerror = () => { setErrMsg("WebSocket connection failed"); setStatus("error"); };
    } catch (e) {
      setErrMsg(e.message || "Microphone access denied");
      setStatus("error");
    }
  };

  const end = () => {
    try { wsRef.current?.send(JSON.stringify({ event: "stop" })); } catch {}
    cleanup();
    setStatus("ended");
  };

  const handleOpenChange = (o) => {
    if (!o) { end(); onClose(); setStatus("idle"); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-sm max-w-lg" data-testid="web-call-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Mic size={16} className="text-[#002FA7]" /> Test Call — {persona?.name}
            <Badge className={`rounded-sm border text-[10px] ml-1 ${
              status === "live" ? "bg-green-100 text-green-800 border-green-200 animate-pulse" :
              status === "connecting" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
              status === "error" ? "bg-red-100 text-red-800 border-red-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {status === "live" ? "● live" : status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="border border-slate-200 rounded-sm bg-slate-50 h-72 overflow-y-auto p-3 space-y-2" data-testid="web-call-transcript">
          {lines.length === 0 && (
            <div className="h-full flex items-center justify-center text-xs text-zinc-400 text-center px-6">
              {status === "idle" && "Start the call and speak into your microphone — the AI persona will respond with voice, exactly like on a phone call."}
              {status === "connecting" && "Connecting to Gemini Live…"}
              {status === "live" && "Listening… say hello!"}
              {status === "ended" && "Call ended. The transcript, recording & summary are saved in Call Logs."}
              {status === "error" && <span className="text-red-600">{errMsg}</span>}
            </div>
          )}
          {lines.map((l, i) => (
            l.role === "tool" ? (
              <div key={i} className="text-[10px] font-mono text-purple-700 flex items-center gap-1"><Wrench size={10} /> {l.text}</div>
            ) : (
              <div key={i} className={`flex ${l.role === "agent" ? "" : "flex-row-reverse"}`}>
                <div className={`max-w-[80%] px-3 py-1.5 text-xs rounded-sm ${l.role === "agent" ? "bg-white border border-slate-200" : "bg-[#002FA7] text-white"}`}>
                  {l.role === "agent" && <Bot size={10} className="inline mr-1 -mt-0.5 text-[#002FA7]" />}{l.text}
                </div>
              </div>
            )
          ))}
        </div>

        <div className="flex gap-2">
          {(status === "idle" || status === "ended" || status === "error") && (
            <Button onClick={start} className="flex-1 bg-[#002FA7] hover:bg-[#002080] rounded-sm" data-testid="web-call-start-button">
              <Mic size={14} className="mr-1.5" /> {status === "idle" ? "Start Test Call" : "Call Again"}
            </Button>
          )}
          {(status === "live" || status === "connecting") && (
            <Button onClick={end} className="flex-1 bg-[#FF3333] hover:bg-[#CC0000] text-white rounded-sm" data-testid="web-call-end-button">
              <PhoneOff size={14} className="mr-1.5" /> End Call
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
