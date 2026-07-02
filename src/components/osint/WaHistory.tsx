import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw, ChevronDown, ChevronRight, Check, Clock, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listMyWaHistory, type WaHistoryRow } from "@/lib/wa-gateway.functions";
import { useAuth } from "@/lib/auth";

export function WaHistory({ featureId, refreshKey }: { featureId: string; refreshKey?: number | string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<WaHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const fetchHistory = useServerFn(listMyWaHistory);

  const load = useCallback(async () => {
    if (!user?.username) return;
    setLoading(true);
    try {
      const r = await fetchHistory({ data: { username: user.username, featureId, limit: 10 } });
      setRows(r?.rows ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [fetchHistory, user?.username, featureId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  useEffect(() => {
    if (!user?.username) return;
    const hasPendingReply = rows.some((r) => r.status === "sent" && !r.reply);
    if (!hasPendingReply) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load, rows, user?.username]);

  if (!user?.username) return null;

  return (
    <div className="border border-border/60 bg-input/20 rounded-sm">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <History className="w-3 h-3" />
        Riwayat Kirim Bot
        <span className="ml-auto flex items-center gap-2">
          <span>{rows.length}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="hover:text-cyber transition-colors"
            title="Muat ulang"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="px-2 py-3 text-[10px] font-mono text-muted-foreground text-center">
          Belum ada riwayat untuk modul ini.
        </div>
      ) : (
        <ul className="divide-y divide-border/40 max-h-64 overflow-auto">
          {rows.map((r) => {
            const open = openId === r.id;
            const hasReply = !!r.reply;
            const icon = hasReply
              ? <Check className="w-3 h-3 text-success" />
              : r.status === "failed"
                ? <X className="w-3 h-3 text-destructive" />
                : <Clock className="w-3 h-3 text-warning" />;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/20"
                >
                  {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                  {icon}
                  <span className="text-[11px] font-mono text-foreground truncate flex-1">{r.query}</span>
                  <span className="text-[9px] font-mono text-muted-foreground shrink-0">
                    {new Date(r.created_at).toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
                {open && (
                  <div className="px-2 pb-2 space-y-1">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Perintah</div>
                    <pre className="text-[10px] font-mono bg-background/60 border border-border/40 rounded-sm p-1.5 whitespace-pre-wrap break-words">{r.command_sent}</pre>
                    <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Balasan Bot</div>
                    {hasReply ? (
                      <pre className="text-[11px] font-mono bg-primary/5 border border-primary/30 rounded-sm p-1.5 whitespace-pre-wrap break-words max-h-72 overflow-auto">{r.reply}</pre>
                    ) : (
                      <div className="text-[10px] font-mono text-muted-foreground italic px-1.5 py-1 border border-dashed border-border/50 rounded-sm">
                        {r.status === "failed" ? "Pengiriman gagal — bot tidak menerima perintah." : "Belum ada balasan dari bot."}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
