import { useState } from "react";
import type { Feature } from "@/lib/osint-data";
import { Cpu, Search, Loader2 } from "lucide-react";
import { WaAutoSend } from "@/components/osint/WaAutoSend";


export function QueryConsole({
  feature,
  onSubmit,
  loading,
}: {
  feature: Feature;
  onSubmit: (q: string) => void;
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) onSubmit(q.trim());
      }}
      className="panel-frame corner-brackets rounded-sm p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-cyber">
        <Cpu className="w-4 h-4" />
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-glow">Intelijen Inti OSINT</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{feature.code}</span>
      </div>

      <div className="space-y-2">
        <div className="border border-cyber/40 bg-input/40 px-3 py-2.5 rounded-sm">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Modul Aktif</div>
          <div className="text-sm font-semibold text-cyber text-glow">{feature.name}</div>
        </div>

        <div className="border border-border bg-input/40 px-3 py-2 rounded-sm">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            Target — {feature.input}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-cyber font-mono">›</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={feature.placeholder}
              className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !q.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm
          bg-cyber text-primary-foreground font-semibold tracking-wider text-sm
          hover:bg-cyber-glow transition-colors disabled:opacity-40 disabled:cursor-not-allowed
          glow-cyber uppercase"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {loading ? "Memproses Query..." : "Verifikasi Akun"}
      </button>

      <WaAutoSend featureId={feature.id} query={q} />
    </form>
  );
}

