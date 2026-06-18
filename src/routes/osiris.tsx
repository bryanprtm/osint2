import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plane, Ship, Camera, Activity, Flame, Newspaper, CloudLightning, Satellite,
  ShieldAlert, Swords, Bitcoin, Gavel, Send, Layers, Radar, Crosshair,
  Globe, Search, X, ArrowLeft, Wifi, Database, Play,
} from "lucide-react";

export const Route = createFileRoute("/osiris")({
  head: () => ({
    meta: [
      { title: "OSIRIS — Open Source Intelligence & Reconnaissance" },
      { name: "description", content: "Real-time global intelligence dashboard: aviation, maritime, CCTV, seismic, fires, news, conflict, crypto, sanctions." },
    ],
  }),
  component: OsirisPage,
});

type Layer = { id: string; label: string; count: number; color: string; icon: any };

const LAYERS: Layer[] = [
  { id: "flights", label: "AVIATION",   count: 8421, color: "#00E5FF", icon: Plane },
  { id: "ships",   label: "MARITIME",   count: 39,   color: "#3B82F6", icon: Ship },
  { id: "cctv",    label: "CCTV",       count: 2014, color: "#A855F7", icon: Camera },
  { id: "quake",   label: "SEISMIC",    count: 127,  color: "#F97316", icon: Activity },
  { id: "fires",   label: "FIRES",      count: 543,  color: "#EF4444", icon: Flame },
  { id: "news",    label: "NEWS LIVE",  count: 26,   color: "#FACC15", icon: Newspaper },
  { id: "weather", label: "WEATHER",    count: 18,   color: "#22D3EE", icon: CloudLightning },
  { id: "sat",     label: "SATELLITES", count: 312,  color: "#94A3B8", icon: Satellite },
  { id: "cyber",   label: "CYBER CVE",  count: 89,   color: "#10B981", icon: ShieldAlert },
  { id: "conf",    label: "CONFLICT",   count: 13,   color: "#DC2626", icon: Swords },
  { id: "crypto",  label: "CRYPTO",     count: 0,    color: "#F59E0B", icon: Bitcoin },
  { id: "ofac",    label: "SANCTIONS",  count: 0,    color: "#D4AF37", icon: Gavel },
  { id: "tg",      label: "TELEGRAM",   count: 0,    color: "#60A5FA", icon: Send },
];

// Random-ish but stable “entity” dots
function genDots(seed: number, n: number) {
  const dots: { x: number; y: number; r: number }[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const x = (s / 233280) * 100;
    s = (s * 9301 + 49297) % 233280;
    const y = 15 + (s / 233280) * 70;
    s = (s * 9301 + 49297) % 233280;
    const r = 0.6 + (s / 233280) * 1.6;
    dots.push({ x, y, r });
  }
  return dots;
}

function ZuluClock() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => {
    const f = () => {
      const d = new Date();
      setT(
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`
      );
    };
    f();
    const iv = setInterval(f, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="tabular-nums text-[#00E5FF] font-bold">ZULU {t}Z</span>;
}

function Uptime() {
  const start = useRef(Date.now());
  const [t, setT] = useState("00:00:00");
  useEffect(() => {
    const iv = setInterval(() => {
      const e = Math.floor((Date.now() - start.current) / 1000);
      setT(`${String(Math.floor(e / 3600)).padStart(2, "0")}:${String(Math.floor((e % 3600) / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="tabular-nums text-[#D4AF37]">{t}</span>;
}

function OsirisPage() {
  const [active, setActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYERS.map((l, i) => [l.id, i < 6]))
  );
  const [panel, setPanel] = useState<"layers" | "recon" | "intel" | null>("layers");
  const [reconTab, setReconTab] = useState("WHOIS");

  const total = useMemo(
    () => LAYERS.filter(l => active[l.id]).reduce((s, l) => s + l.count, 0),
    [active]
  );

  return (
    <div className="min-h-screen w-full bg-[#04070d] text-slate-200 font-mono relative overflow-hidden">
      {/* MAP BACKGROUND */}
      <MapBackdrop active={active} />

      {/* TOP BAR */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2 border-b border-[#00E5FF]/20 bg-[#04070d]/85 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-[10px] tracking-widest text-slate-400 hover:text-[#00E5FF]">
            <ArrowLeft className="w-3 h-3" /> BACK
          </Link>
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="w-6 h-6 grid place-items-center border border-[#00E5FF]/60 text-[#00E5FF] text-[10px] rotate-45">
              <span className="-rotate-45">⬡</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-[0.3em] text-white">OSIRIS</div>
              <div className="text-[9px] tracking-[0.25em] text-[#00E5FF]/70">OSINT · RECON · INTEL</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] tracking-widest">
          <span className="hidden md:inline text-slate-500">
            ENTITIES <span className="text-[#10B981] font-bold tabular-nums">{total.toLocaleString()}</span>
          </span>
          <span className="hidden md:inline text-slate-500">UPTIME <Uptime /></span>
          <ZuluClock />
          <span className="flex items-center gap-1 text-[#10B981]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" /> LINK
          </span>
        </div>
      </header>

      {/* LEFT TOOL RAIL */}
      <nav className="absolute left-0 top-12 bottom-10 z-30 w-12 border-r border-white/10 bg-[#04070d]/80 flex flex-col items-center py-3 gap-1">
        {[
          { id: "layers", icon: Layers, label: "Layers" },
          { id: "recon",  icon: Radar,  label: "Recon"  },
          { id: "intel",  icon: Crosshair, label: "Intel" },
        ].map(b => (
          <button
            key={b.id}
            onClick={() => setPanel(panel === (b.id as any) ? null : (b.id as any))}
            title={b.label}
            className={`w-9 h-9 grid place-items-center border rounded-sm transition
              ${panel === b.id
                ? "border-[#00E5FF] text-[#00E5FF] bg-[#00E5FF]/10 shadow-[0_0_12px_rgba(0,229,255,0.35)]"
                : "border-white/10 text-slate-500 hover:text-slate-200 hover:border-white/30"}`}
          >
            <b.icon className="w-4 h-4" />
          </button>
        ))}
        <div className="flex-1" />
        <button title="Globe" className="w-9 h-9 grid place-items-center border border-white/10 text-slate-500 hover:text-[#00E5FF] hover:border-[#00E5FF]/50 rounded-sm">
          <Globe className="w-4 h-4" />
        </button>
      </nav>

      {/* LAYER PANEL */}
      {panel === "layers" && (
        <Panel title="INTEL LAYERS" onClose={() => setPanel(null)}>
          <div className="px-2 py-2 space-y-1 max-h-[58vh] overflow-y-auto">
            {LAYERS.map(l => {
              const on = active[l.id];
              const Icon = l.icon;
              return (
                <button
                  key={l.id}
                  onClick={() => setActive(p => ({ ...p, [l.id]: !p[l.id] }))}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border text-[11px] tracking-wider transition
                    ${on
                      ? "border-white/15 bg-white/[0.04] text-white"
                      : "border-white/5 text-slate-500 hover:bg-white/[0.03]"}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: on ? l.color : "transparent", boxShadow: on ? `0 0 8px ${l.color}` : undefined, border: `1px solid ${l.color}` }}
                    />
                    <Icon className="w-3.5 h-3.5" style={{ color: on ? l.color : undefined }} />
                    {l.label}
                  </span>
                  <span className="tabular-nums text-[10px] text-slate-400">{l.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-white/10 text-[10px] flex justify-between text-slate-500">
            <span>ACTIVE <span className="text-[#10B981]">{Object.values(active).filter(Boolean).length}</span>/{LAYERS.length}</span>
            <button onClick={() => setActive(Object.fromEntries(LAYERS.map(l => [l.id, false])))} className="hover:text-[#EF4444]">CLEAR</button>
          </div>
        </Panel>
      )}

      {/* RECON PANEL */}
      {panel === "recon" && (
        <Panel title="RECON TOOLKIT" onClose={() => setPanel(null)}>
          <div className="p-2 border-b border-white/10 flex flex-wrap gap-1">
            {["WHOIS", "DNS", "IP", "PORTS", "SSL", "CVE", "CRYPTO", "OFAC"].map(t => (
              <button
                key={t}
                onClick={() => setReconTab(t)}
                className={`px-2 py-1 text-[10px] tracking-widest border rounded-sm transition
                  ${reconTab === t
                    ? "border-[#00E5FF] text-[#00E5FF] bg-[#00E5FF]/10"
                    : "border-white/10 text-slate-500 hover:text-slate-200"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="p-3 space-y-2">
            <label className="text-[10px] tracking-widest text-slate-500">TARGET</label>
            <div className="flex items-center gap-2 border border-white/15 bg-black/40 px-2">
              <Search className="w-3.5 h-3.5 text-[#00E5FF]" />
              <input
                placeholder={reconTab === "CRYPTO" ? "bc1q... / 0x..." : "example.com / 8.8.8.8"}
                className="flex-1 bg-transparent py-2 text-xs outline-none placeholder:text-slate-600"
              />
              <button className="text-[10px] tracking-widest text-[#00E5FF] hover:text-white px-2 py-1 border-l border-white/10">RUN</button>
            </div>
            <div className="mt-3 border border-white/10 bg-black/40 p-3 h-40 text-[11px] text-slate-500 overflow-auto">
              <div className="text-[#10B981]">$ osiris {reconTab.toLowerCase()} --query &lt;target&gt;</div>
              <div className="mt-1">[ready] Awaiting input...</div>
            </div>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Recon module mirrors the original OSIRIS toolkit (port scan, DNS, WHOIS, SSL inspector,
              IP intel, CVE lookup, BTC/ETH trace, OFAC SDN search). UI preview only.
            </p>
          </div>
        </Panel>
      )}

      {/* INTEL PANEL */}
      {panel === "intel" && (
        <Panel title="INTEL FEED" onClose={() => setPanel(null)}>
          <div className="p-2 space-y-2 max-h-[58vh] overflow-y-auto">
            {INTEL.map((it, i) => (
              <div key={i} className="border-l-2 px-2 py-1.5" style={{ borderColor: it.color }}>
                <div className="flex items-center justify-between text-[9px] tracking-widest text-slate-500">
                  <span style={{ color: it.color }}>{it.tag}</span>
                  <span>{it.time}</span>
                </div>
                <div className="text-[11px] text-slate-200 leading-snug">{it.text}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* RIGHT HUD — MARKETS / STATS */}
      <aside className="hidden xl:flex absolute right-3 top-16 z-20 w-64 flex-col gap-2">
        <HudCard title="GLOBAL STATUS">
          <Row k="THREAT LEVEL" v={<span className="text-[#F97316]">ELEVATED</span>} />
          <Row k="ACTIVE LAYERS" v={<span className="text-[#00E5FF]">{Object.values(active).filter(Boolean).length}</span>} />
          <Row k="ENTITIES" v={<span className="text-[#10B981]">{total.toLocaleString()}</span>} />
          <Row k="NODE" v={<span className="text-slate-300">EU-CENTRAL</span>} />
        </HudCard>
        <HudCard title="LIVE BROADCAST">
          {["BBC World", "Al Jazeera", "France 24", "NHK World", "Sky News"].map(n => (
            <button key={n} className="w-full flex items-center justify-between text-[11px] py-1 group">
              <span className="flex items-center gap-2 text-slate-300 group-hover:text-white">
                <Play className="w-3 h-3 text-[#EF4444]" /> {n}
              </span>
              <span className="text-[9px] text-[#EF4444] tracking-widest">● LIVE</span>
            </button>
          ))}
        </HudCard>
        <HudCard title="DATA SOURCES">
          <Row k="OPENSKY" v={<Dot ok />} />
          <Row k="USGS" v={<Dot ok />} />
          <Row k="NASA FIRMS" v={<Dot ok />} />
          <Row k="NVD CVE" v={<Dot ok />} />
          <Row k="OPENSANCTIONS" v={<Dot ok />} />
        </HudCard>
      </aside>

      {/* BOTTOM STATUS BAR */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 h-10 px-3 flex items-center justify-between border-t border-[#00E5FF]/20 bg-[#04070d]/85 text-[10px] tracking-widest text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[#10B981]"><Wifi className="w-3 h-3" /> BACKEND ONLINE</span>
          <span className="hidden md:inline">LAT 0.000 · LON 0.000 · Z 2.4</span>
          <span className="hidden lg:inline">GPU · WEBGL ACCELERATED</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline">RENDER 60 FPS</span>
          <span className="flex items-center gap-1.5"><Database className="w-3 h-3" /> CACHE WARM</span>
          <span className="text-[#D4AF37]">OSIRIS v1.0 · UI PREVIEW</span>
        </div>
      </footer>
    </div>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="absolute left-14 top-16 z-20 w-72 bg-[#04070d]/95 border border-[#00E5FF]/30 shadow-[0_0_24px_rgba(0,229,255,0.15)] rounded-sm">
      <header className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-[11px] tracking-[0.25em] text-[#00E5FF]">{title}</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </header>
      {children}
    </section>
  );
}

function HudCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#04070d]/90 border border-white/10 rounded-sm">
      <div className="px-3 py-1.5 border-b border-white/10 text-[10px] tracking-[0.25em] text-[#D4AF37]">{title}</div>
      <div className="p-2 space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-500 tracking-widest text-[10px]">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function Dot({ ok }: { ok?: boolean }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? "bg-[#10B981] shadow-[0_0_6px_#10B981]" : "bg-slate-600"}`} />;
}

const INTEL = [
  { tag: "SEISMIC",  color: "#F97316", time: "00:14Z", text: "M4.6 — 87km SW of Atka, Aleutian Islands. Depth 32km." },
  { tag: "AVIATION", color: "#00E5FF", time: "00:12Z", text: "Squawk 7700 detected over North Atlantic (UAL 921)." },
  { tag: "CYBER",    color: "#10B981", time: "00:09Z", text: "CVE-2026-1042 published — critical RCE in popular runtime." },
  { tag: "CONFLICT", color: "#DC2626", time: "00:07Z", text: "Increased radar activity reported near contested airspace." },
  { tag: "FIRES",    color: "#EF4444", time: "00:05Z", text: "NASA FIRMS: 42 new hotspots clustered over central Brazil." },
  { tag: "NEWS",     color: "#FACC15", time: "00:02Z", text: "Reuters: emergency UN session scheduled within 6 hours." },
  { tag: "SANCTIONS",color: "#D4AF37", time: "00:01Z", text: "OFAC SDN updated — 17 new entries (vessels, individuals)." },
];

/* ------------------------------ MAP BACKDROP ------------------------------ */
function MapBackdrop({ active }: { active: Record<string, boolean> }) {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* gradient deep ocean */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0a1626_0%,#04070d_70%)]" />
      {/* lat/long grid */}
      <svg className="absolute inset-0 w-full h-full opacity-25" preserveAspectRatio="none" viewBox="0 0 100 100">
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`v${i}`} x1={(i / 12) * 100} y1="0" x2={(i / 12) * 100} y2="100" stroke="#00E5FF" strokeWidth="0.05" />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={(i / 6) * 100} x2="100" y2={(i / 6) * 100} stroke="#00E5FF" strokeWidth="0.05" />
        ))}
        {/* equator + meridian */}
        <line x1="0" y1="50" x2="100" y2="50" stroke="#D4AF37" strokeWidth="0.08" strokeDasharray="0.5,0.5" />
        <line x1="50" y1="0" x2="50" y2="100" stroke="#D4AF37" strokeWidth="0.08" strokeDasharray="0.5,0.5" />
      </svg>

      {/* stylised continents */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <g fill="#0e2740" stroke="#00E5FF" strokeWidth="0.12" strokeOpacity="0.5">
          {/* North America */}
          <path d="M8,28 L24,22 L30,30 L28,42 L18,48 L10,42 Z" />
          {/* South America */}
          <path d="M24,52 L30,50 L32,64 L26,76 L22,70 Z" />
          {/* Europe */}
          <path d="M44,26 L54,24 L56,32 L48,36 L44,32 Z" />
          {/* Africa */}
          <path d="M46,38 L58,36 L60,52 L52,66 L46,58 Z" />
          {/* Asia */}
          <path d="M56,22 L84,20 L88,34 L78,42 L62,38 L58,30 Z" />
          {/* Oceania */}
          <path d="M76,58 L88,56 L90,66 L80,68 Z" />
        </g>
      </svg>

      {/* layer dots */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {LAYERS.map((l, i) => {
          if (!active[l.id]) return null;
          const dots = genDots((i + 1) * 137, Math.min(80, Math.max(8, Math.floor(l.count / 30) + 12)));
          return (
            <g key={l.id} fill={l.color} fillOpacity="0.85">
              {dots.map((d, idx) => (
                <circle key={idx} cx={d.x} cy={d.y} r={d.r * 0.25}>
                  <animate attributeName="fill-opacity" values="0.35;1;0.35" dur={`${2 + (idx % 4)}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* scanline sweep */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_0%,rgba(0,229,255,0.04)_50%,transparent_100%)] bg-[length:100%_4px]" />
      <div className="absolute inset-0 pointer-events-none animate-pulse bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,255,0.06),transparent_60%)]" />
    </div>
  );
}
