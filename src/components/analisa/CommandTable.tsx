import { CheckCircle2, Clock, XCircle, MinusCircle, Loader2 } from "lucide-react";
import type { StepRow } from "@/lib/analisa-ai.functions";

function StatusIcon({ status }: { status: StepRow["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    case "sent":
    case "pending":
      return <Loader2 className="w-3.5 h-3.5 text-cyber animate-spin" />;
    case "error":
      return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case "timeout":
      return <Clock className="w-3.5 h-3.5 text-warning" />;
    case "skipped":
      return <MinusCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function toRows(parsed: unknown): Record<string, unknown>[] {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    // closestBTS shape: { points: [] }
    if (Array.isArray((obj as any).points)) return (obj as any).points as Record<string, unknown>[];
    return [obj];
  }
  return [];
}

export function CommandTable({ step, label }: { step: StepRow; label: string }) {
  const rows = toRows(step.parsed);
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  return (
    <div className="border border-cyber/25 bg-panel/50 rounded-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyber/20 bg-cyber/5">
        <StatusIcon status={step.status} />
        <span className="text-xs font-mono uppercase tracking-wider text-cyber text-glow">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {step.command} {step.query || "—"}
        </span>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {step.status}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="bg-panel-elevated/40 text-cyber/80">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 uppercase text-[10px] tracking-wider font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/50 hover:bg-cyber/5">
                  {headers.map((h) => {
                    const v = r[h];
                    const s = v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
                    return (
                      <td key={h} className="px-3 py-1.5 text-foreground align-top break-all">
                        {s}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : step.reply ? (
        <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap break-words text-muted-foreground max-h-52 overflow-auto">
          {step.reply}
        </pre>
      ) : (
        <div className="p-3 text-[11px] font-mono text-muted-foreground">
          {step.status === "sent" && "Menunggu balasan bot…"}
          {step.status === "pending" && "Belum dikirim."}
          {step.status === "timeout" && "Timeout — balasan bot tidak diterima dalam 5 menit."}
          {step.status === "error" && "Gagal mengirim perintah ke bot."}
          {step.status === "skipped" && "Dilewati — data prasyarat tidak tersedia."}
        </div>
      )}

      {step.reply && rows.length > 0 && (
        <details className="border-t border-border/50">
          <summary className="cursor-pointer px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-cyber">
            ▸ Balasan mentah
          </summary>
          <pre className="px-3 pb-3 text-[11px] font-mono whitespace-pre-wrap break-words text-muted-foreground max-h-52 overflow-auto">
            {step.reply}
          </pre>
        </details>
      )}
    </div>
  );
}
