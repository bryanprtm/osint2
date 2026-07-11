import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAnalysisRuns, getAnalysisRun, type RunRow } from "@/lib/analisa-ai.functions";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, History, Eye, Loader2 } from "lucide-react";
import { CommandTable } from "@/components/analisa/CommandTable";

export const Route = createFileRoute("/analisa-ai/history")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Riwayat Analisa AI — Den 404 Anti Eror OSINT" },
      { name: "description", content: "Riwayat semua sesi analisa AI target: chat balasan bot & ringkasan AI." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { ready, user } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listAnalysisRuns);
  const getFn = useServerFn(getAnalysisRun);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<RunRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const r = await listFn({ data: { limit: 50 } });
      if (r.ok) setRuns(r.runs as RunRow[]);
      setLoading(false);
    })();
  }, [user, listFn]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setDetail(null);
    const r = await getFn({ data: { runId: id } });
    if (r.ok) setDetail(r.run);
    setLoadingDetail(false);
  };

  if (!ready || !user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-4 border-b border-border flex items-center gap-4">
        <Link to="/analisa-ai" className="flex items-center gap-1.5 text-[11px] font-mono tracking-widest text-muted-foreground hover:text-cyber">
          <ArrowLeft className="w-3.5 h-3.5" /> ANALISA
        </Link>
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-cyber" />
          <h1 className="text-lg font-bold tracking-tight">
            Riwayat <span className="text-cyber text-glow">Analisa AI</span>
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <div className="panel-frame rounded-sm p-3 space-y-2 max-h-[80vh] overflow-y-auto">
          <div className="text-[10px] font-mono uppercase tracking-widest text-cyber">Sesi ({runs.length})</div>
          {loading && <div className="text-xs font-mono text-muted-foreground">Loading…</div>}
          {!loading && runs.length === 0 && (
            <div className="text-xs font-mono text-muted-foreground">Belum ada sesi analisa.</div>
          )}
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => openDetail(r.id)}
              className={`w-full text-left border rounded-sm px-2.5 py-2 hover:border-cyber transition-colors ${
                detail?.id === r.id ? "border-cyber bg-cyber/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-cyber">{r.target_phone}</span>
                <span className={`ml-auto text-[10px] font-mono ${
                  r.status === "done" ? "text-success" : r.status === "running" ? "text-warning" : "text-muted-foreground"
                }`}>{r.status.toUpperCase()}</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                {new Date(r.created_at).toLocaleString("id-ID")}
              </div>
              {r.username && (
                <div className="text-[10px] font-mono text-muted-foreground/70">op: {r.username}</div>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {loadingDetail && (
            <div className="panel-frame rounded-sm p-6 flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat detail…
            </div>
          )}
          {!detail && !loadingDetail && (
            <div className="panel-frame rounded-sm p-6 text-xs font-mono text-muted-foreground flex items-center gap-2">
              <Eye className="w-4 h-4" /> Pilih sesi di kiri untuk melihat balasan chat & analisa AI.
            </div>
          )}
          {detail && (
            <>
              <div className="panel-frame corner-brackets rounded-sm p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-cyber">Target</div>
                <div className="text-lg font-mono text-cyber text-glow">{detail.target_phone}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {new Date(detail.created_at).toLocaleString("id-ID")} · status {detail.status}
                </div>
              </div>

              {detail.ai_summary && (
                <div className="panel-frame rounded-sm p-4">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-cyber mb-2">Analisa AI</div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{detail.ai_summary}</div>
                </div>
              )}

              <div className="space-y-3">
                {detail.steps.map((s, i) => (
                  <CommandTable key={s.id} step={s} label={`Step ${i + 1} · ${s.command}`} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
