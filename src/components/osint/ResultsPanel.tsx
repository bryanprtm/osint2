import { useState } from "react";
import type { OsintResult } from "@/lib/osint-data";
import { Download, Terminal, Copy, Check, Clock, Hash, Database, ChevronDown, ChevronRight, FileJson, FileSpreadsheet } from "lucide-react";

export function ResultsPanel({ result, loading }: { result: OsintResult | null; loading: boolean }) {
  const [copiedAll, setCopiedAll] = useState(false);

  const copyJson = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${result.feature}-${Date.now()}.json`);
  };

  const downloadCsv = () => {
    if (!result || result.data.length === 0) return;
    const headers = Array.from(new Set(result.data.flatMap((r) => Object.keys(r))));
    const csv = [
      headers.join(","),
      ...result.data.map((r) =>
        headers.map((h) => {
          const v = r[h];
          const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")
      ),
    ].join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv" }), `${result.feature}-${Date.now()}.csv`);
  };

  return (
    <div className="panel-frame corner-brackets rounded-sm relative overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cyber/30 bg-panel-elevated/60">
        <Terminal className="w-4 h-4 text-cyber" />
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-cyber text-glow">
          Output Stream
        </span>
        {result && (
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={copyJson} className="flex items-center gap-1 px-2 py-1 rounded-sm border border-border text-[10px] font-mono hover:border-cyber hover:text-cyber transition-colors">
              {copiedAll ? <><Check className="w-3 h-3 text-success" /> COPIED</> : <><Copy className="w-3 h-3" /> JSON</>}
            </button>
            <button onClick={downloadJson} className="flex items-center gap-1 px-2 py-1 rounded-sm border border-border text-[10px] font-mono hover:border-cyber hover:text-cyber transition-colors">
              <FileJson className="w-3 h-3" /> .json
            </button>
            <button onClick={downloadCsv} className="flex items-center gap-1 px-2 py-1 rounded-sm border border-border text-[10px] font-mono hover:border-cyber hover:text-cyber transition-colors">
              <FileSpreadsheet className="w-3 h-3" /> .csv
            </button>
          </div>
        )}
      </div>

      <div className="p-4 max-h-[560px] overflow-auto scanline relative space-y-3">
        {loading && (
          <div className="font-mono text-cyber text-sm space-y-1">
            <div>$ initializing osint pipeline...</div>
            <div>$ handshake → DUKCAPIL · BPJS · SAMSAT · TELCO</div>
            <div className="text-muted-foreground">$ querying nodes <span className="animate-pulse">▮▮▮▯▯</span></div>
          </div>
        )}

        {!loading && !result && (
          <div className="font-mono text-muted-foreground text-sm space-y-2 py-8 text-center">
            <div className="text-cyber/60 text-xs uppercase tracking-[0.3em]">SISTEM SIAP</div>
            <div>Pilih modul intelijen dan masukkan target untuk memulai.</div>
          </div>
        )}

        {!loading && result && (
          <>
            <SummaryCard result={result} />
            {result.data.length === 0 ? (
              <div className="font-mono text-muted-foreground text-xs text-center py-6 border border-dashed border-border rounded-sm">
                Tidak ada record yang ditemukan.
              </div>
            ) : (
              <div className="space-y-2">
                {result.data.map((rec, i) => (
                  <RecordCard key={i} index={i} total={result.data.length} record={rec} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ result }: { result: OsintResult }) {
  const ts = new Date(result.timestamp);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <SummaryItem icon={<Database className="w-3 h-3" />} label="Status" value={result.status ? "OK" : "FAIL"} accent={result.status ? "text-success" : "text-destructive"} />
      <SummaryItem icon={<Hash className="w-3 h-3" />} label="Records" value={String(result.data.length)} accent="text-cyber" />
      <SummaryItem icon={<Terminal className="w-3 h-3" />} label="Modul" value={result.feature.toUpperCase()} accent="text-foreground" />
      <SummaryItem icon={<Clock className="w-3 h-3" />} label="Timestamp" value={ts.toLocaleTimeString("id-ID", { hour12: false })} accent="text-muted-foreground" />
    </div>
  );
}

function SummaryItem({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="panel-frame rounded-sm px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`text-xs font-mono font-bold mt-0.5 truncate ${accent}`}>{value}</div>
    </div>
  );
}

function RecordCard({ index, total, record }: { index: number; total: number; record: Record<string, unknown> }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const copyVal = async (k: string, v: unknown) => {
    await navigator.clipboard.writeText(typeof v === "object" ? JSON.stringify(v) : String(v));
    setCopied(k);
    setTimeout(() => setCopied(null), 1200);
  };

  const entries = Object.entries(record);

  return (
    <div className="border border-cyber/30 rounded-sm bg-panel/40 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-cyber/5 hover:bg-cyber/10 transition-colors border-b border-cyber/20"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-cyber" /> : <ChevronRight className="w-3.5 h-3.5 text-cyber" />}
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyber">
          Record {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{entries.length} fields</span>
      </button>

      {open && (
        <div className="divide-y divide-border/40">
          {entries.map(([k, v]) => (
            <FieldRow key={k} k={k} v={v} copied={copied === k} onCopy={() => copyVal(k, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ k, v, copied, onCopy }: { k: string; v: unknown; copied: boolean; onCopy: () => void }) {
  const isUrl = typeof v === "string" && /^https?:\/\//.test(v);
  const isImage = isUrl && /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(v as string);
  const isStatus = /^STATUS|AKTIF|NONAKTIF/i.test(String(v));
  const valStr = v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  let valueClass = "text-foreground";
  if (typeof v === "boolean") valueClass = v ? "text-success" : "text-destructive";
  else if (typeof v === "number") valueClass = "text-cyber";
  else if (isStatus && /AKTIF/i.test(valStr) && !/NON/i.test(valStr)) valueClass = "text-success";
  else if (/NONAKTIF|FAIL/i.test(valStr)) valueClass = "text-destructive";

  return (
    <div className="group grid grid-cols-[140px_1fr_auto] items-start gap-3 px-3 py-2 hover:bg-cyber/5 transition-colors">
      <div className="text-[10px] font-mono uppercase tracking-wider text-cyber/80 pt-0.5">{k}</div>
      <div className={`text-xs font-mono break-all ${valueClass}`}>
        {isImage ? (
          <a href={valStr} target="_blank" rel="noreferrer">
            <img src={valStr} alt={k} className="max-h-32 rounded-sm border border-cyber/30" />
          </a>
        ) : isUrl ? (
          <a href={valStr} target="_blank" rel="noreferrer" className="text-cyber underline decoration-cyber/40 hover:decoration-cyber">
            {valStr}
          </a>
        ) : (
          valStr
        )}
      </div>
      <button
        onClick={onCopy}
        title="Salin nilai"
        className="opacity-0 group-hover:opacity-100 p-1 rounded-sm hover:bg-panel-elevated text-muted-foreground hover:text-cyber transition-all"
      >
        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
