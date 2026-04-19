import { JsonTree } from "./JsonTree";
import type { OsintResult } from "@/lib/osint-data";
import { Download, Terminal } from "lucide-react";

export function ResultsPanel({ result, loading }: { result: OsintResult | null; loading: boolean }) {
  return (
    <div className="panel-frame corner-brackets rounded-sm relative overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cyber/30 bg-panel-elevated/60">
        <Terminal className="w-4 h-4 text-cyber" />
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-cyber text-glow">
          Output Stream
        </span>
        {result && (
          <span className="ml-auto flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className="text-success">● {result.data.length} record(s)</span>
            <button className="flex items-center gap-1 hover:text-cyber transition-colors">
              <Download className="w-3 h-3" /> EXPORT
            </button>
          </span>
        )}
      </div>

      <div className="p-4 max-h-[560px] overflow-auto scanline relative">
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
          <div>
            <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border/50">
              <div className="text-xs font-mono uppercase tracking-wider text-cyber">STATUS</div>
              <div className="text-sm font-mono text-success">{String(result.status)}</div>
            </div>
            <JsonTree data={{ DATA: result.data }} />
          </div>
        )}
      </div>
    </div>
  );
}
