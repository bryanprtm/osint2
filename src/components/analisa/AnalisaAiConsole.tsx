import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  startAnalysis,
  getAnalysisRun,
  advanceAnalysisStep,
  abortAnalysis,
  generateAiSummary,
  listAnalysisRuns,
  STEP_DEFS,
  type RunRow,
  type StepRow,
} from "@/lib/analisa-ai.functions";
import { useAuth } from "@/lib/auth";
import { TargetMap, type MapPoint } from "./TargetMap";
import { CommandTable } from "./CommandTable";
import { Brain, History, Loader2, Play, Sparkles, Square, Target } from "lucide-react";

const POLL_MS = 5_000;
const HISTORY_REFRESH_MS = 15_000;

export function AnalisaAiConsole() {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [run, setRun] = useState<RunRow | null>(null);
  const [starting, setStarting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<RunRow[]>([]);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const startFn = useServerFn(startAnalysis);
  const getFn = useServerFn(getAnalysisRun);
  const advFn = useServerFn(advanceAnalysisStep);
  const abortFn = useServerFn(abortAnalysis);
  const sumFn = useServerFn(generateAiSummary);
  const listFn = useServerFn(listAnalysisRuns);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancingRef = useRef(false);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const refreshHistory = useCallback(async () => {
    try {
      const r = await listFn({ data: { limit: 50 } });
      if (r.ok) setHistory(r.runs as RunRow[]);
    } catch { /* ignore */ }
  }, [listFn]);

  const tick = useCallback(async (runId: string) => {
    try {
      const g = await getFn({ data: { runId } });
      if (g.ok) setRun(g.run);
      if (!advancingRef.current) {
        advancingRef.current = true;
        try {
          const a = await advFn({ data: { runId } });
          if (a.ok && a.run) setRun(a.run);
          if (a.ok && (a as any).done) { stopPolling(); }
        } finally {
          advancingRef.current = false;
        }
      }
    } catch { /* keep polling */ }
  }, [getFn, advFn]);

  useEffect(() => {
    void refreshHistory();
    historyRef.current = setInterval(() => void refreshHistory(), HISTORY_REFRESH_MS);
    return () => {
      stopPolling();
      if (historyRef.current) clearInterval(historyRef.current);
    };
  }, [refreshHistory]);

  const openRun = useCallback(async (runId: string) => {
    stopPolling();
    setMsg(null);
    const g = await getFn({ data: { runId } });
    if (g.ok) {
      setRun(g.run);
      if (g.run.status === "running") {
        pollRef.current = setInterval(() => void tick(runId), POLL_MS);
      }
    }
  }, [getFn, tick]);

  const handleStart = async () => {
    if (!phone.trim()) return;
    setStarting(true);
    setMsg(null);
    setRun(null);
    try {
      const r = await startFn({ data: { phone, username: user?.username } });
      if (!r.ok) { setMsg(r.message); return; }
      const g = await getFn({ data: { runId: r.runId } });
      if (g.ok) setRun(g.run);
      stopPolling();
      pollRef.current = setInterval(() => void tick(r.runId), POLL_MS);
      void refreshHistory();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const handleAbort = async (runId: string) => {
    setStoppingId(runId);
    try {
      await abortFn({ data: { runId } });
      if (run?.id === runId) {
        stopPolling();
        const g = await getFn({ data: { runId } });
        if (g.ok) setRun(g.run);
      }
      await refreshHistory();
    } finally {
      setStoppingId(null);
    }
  };

  const handleSummary = async () => {
    if (!run) return;
    setSummarizing(true);
    setMsg(null);
    try {
      const r = await sumFn({ data: { runId: run.id } });
      if (!r.ok) { setMsg(r.message); return; }
      const g = await getFn({ data: { runId: run.id } });
      if (g.ok) setRun(g.run);
    } finally {
      setSummarizing(false);
    }
  };

  const mapPoints: MapPoint[] = useMemo(() => {
    if (!run) return [];
    const pts: MapPoint[] = [];
    for (const s of run.steps) {
      if (s.status !== "done" || !s.parsed) continue;
      if (s.key === "cp") {
        const p = s.parsed as any;
        if (typeof p?.lat === "number" && typeof p?.long === "number") {
          pts.push({ id: s.id, lat: p.lat, long: p.long, kind: "cp", label: `Lokasi Awal (${s.query})` });
        }
      } else if (s.key === "convertBTS") {
        const p = s.parsed as any;
        if (typeof p?.lat === "number" && typeof p?.long === "number") {
          pts.push({ id: s.id, lat: p.lat, long: p.long, kind: "convertBTS", label: `BTS ${p.bts_id ?? s.query}` });
        }
      } else if (s.key === "closestBTS") {
        const arr = ((s.parsed as any)?.points ?? []) as any[];
        arr.forEach((p, i) => {
          if (typeof p?.lat === "number" && typeof p?.long === "number") {
            pts.push({
              id: `${s.id}-${i}`,
              lat: p.lat,
              long: p.long,
              kind: "closestBTS",
              label: `Closest #${i + 1} ${p.bts_id ?? ""}${p.distance ? ` · ${p.distance}` : ""}`,
              distance_m: typeof p.distance_m === "number" ? p.distance_m : undefined,
            });
          }
        });
      }
    }
    return pts;
  }, [run]);

  const progressPct = run
    ? Math.min(100, Math.round(((run.steps.filter((s) => ["done", "timeout", "skipped", "error"].includes(s.status)).length) / STEP_DEFS.length) * 100))
    : 0;
  const isRunning = run?.status === "running";

  return (
    <div className="space-y-4">
      {/* Header form */}
      <div className="panel-frame corner-brackets rounded-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-cyber">
          <Target className="w-4 h-4" />
          <span className="text-xs font-mono uppercase tracking-[0.25em] text-glow">Analisa AI Target</span>
        </div>
        <div className="border border-cyber/40 bg-input/40 px-3 py-2 rounded-sm flex items-center gap-2">
          <span className="text-cyber font-mono">›</span>
          <input
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!!run && isRunning}
            placeholder="Nomor HP target (628xxxxxxxxx)"
            className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground/50 disabled:opacity-50"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={starting || (!!run && isRunning) || !phone.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-sm bg-cyber text-primary-foreground font-semibold tracking-wider text-sm hover:bg-cyber-glow transition-colors disabled:opacity-40 disabled:cursor-not-allowed glow-cyber uppercase"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {starting ? "Memulai..." : "Mulai Analisa"}
          </button>
          {run && isRunning && (
            <button
              onClick={() => handleAbort(run.id)}
              disabled={stoppingId === run.id}
              className="flex items-center gap-2 py-2.5 px-4 rounded-sm border border-destructive/50 text-destructive hover:bg-destructive/10 font-mono uppercase text-xs tracking-wider disabled:opacity-40"
            >
              <Square className="w-3.5 h-3.5" /> Hentikan
            </button>
          )}
        </div>
        <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
          Rangkaian 9 perintah bot WhatsApp dijalankan otomatis dengan jeda 5 menit antar perintah
          (/cp → /data → /convertBTS → /closestBTS → /data NIK → /nikdetail → /kk → /nkes → /prof).
          Total estimasi ± 45 menit. <span className="text-success">Proses berjalan di server</span> — halaman
          boleh ditutup / di-back, analisa tetap lanjut. Riwayat sesi tampil di bawah.
        </p>
        {msg && <div className="text-[11px] font-mono text-destructive bg-destructive/10 border border-destructive/30 px-2 py-1 rounded-sm">{msg}</div>}
      </div>

      {run && (
        <>
          {/* Progres bar */}
          <div className="panel-frame rounded-sm p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-cyber">Progres</span>
              <span className="text-muted-foreground">{run.steps.length}/{STEP_DEFS.length} step</span>
              <span className="ml-auto text-cyber">{progressPct}%</span>
              <span className="text-muted-foreground">·</span>
              <span className={run.status === "done" ? "text-success" : run.status === "aborted" ? "text-destructive" : "text-warning"}>
                {run.status.toUpperCase()}
              </span>
            </div>
            <div className="h-2 w-full bg-panel-elevated rounded-sm overflow-hidden">
              <div className="h-full bg-cyber transition-all glow-cyber" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Map */}
          <TargetMap points={mapPoints} height={360} />

          {/* Tabel per command */}
          <div className="space-y-3">
            {STEP_DEFS.map((def, i) => {
              const step: StepRow | undefined = run.steps.find((s) => s.step_index === i);
              if (!step) {
                return (
                  <div key={def.key} className="border border-dashed border-border rounded-sm px-3 py-2 text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                    <span className="text-cyber/50">Step {i + 1}/{STEP_DEFS.length}</span>
                    <span>{def.label} ({def.command}) — menunggu giliran…</span>
                  </div>
                );
              }
              return <CommandTable key={step.id} step={step} label={`Step ${i + 1} · ${def.label}`} />;
            })}
          </div>

          {/* Analisa AI */}
          <div className="panel-frame corner-brackets rounded-sm">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cyber/30 bg-panel-elevated/60">
              <Brain className="w-4 h-4 text-cyber" />
              <span className="text-xs font-mono uppercase tracking-[0.25em] text-cyber text-glow">Analisa AI</span>
              <button
                onClick={handleSummary}
                disabled={summarizing}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-cyber/40 text-cyber hover:bg-cyber/10 text-[10px] font-mono uppercase tracking-wider disabled:opacity-40"
              >
                {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {run.ai_summary ? "Regenerate" : "Generate"}
              </button>
            </div>
            <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {run.ai_summary ? (
                <div className="text-foreground">{run.ai_summary}</div>
              ) : (
                <div className="text-muted-foreground text-xs font-mono">
                  Klik <b>Generate</b> untuk membuat analisa AI berdasarkan seluruh data yang sudah dikumpulkan.
                  Direkomendasikan setelah semua step selesai agar konteksnya utuh.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Riwayat inline */}
      <div className="panel-frame rounded-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cyber/30 bg-panel-elevated/60">
          <History className="w-4 h-4 text-cyber" />
          <span className="text-xs font-mono uppercase tracking-[0.25em] text-cyber text-glow">Riwayat Analisa</span>
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">{history.length} sesi</span>
        </div>
        <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
          {history.length === 0 && (
            <div className="text-xs font-mono text-muted-foreground px-1 py-2">Belum ada sesi analisa.</div>
          )}
          {history.map((r) => {
            const active = run?.id === r.id;
            const running = r.status === "running";
            return (
              <div
                key={r.id}
                className={`border rounded-sm px-2.5 py-2 flex items-center gap-2 transition-colors ${
                  active ? "border-cyber bg-cyber/5" : "border-border hover:border-cyber/50"
                }`}
              >
                <button
                  onClick={() => void openRun(r.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-cyber">{r.target_phone}</span>
                    <span className={`text-[10px] font-mono ${
                      r.status === "done" ? "text-success"
                      : running ? "text-warning"
                      : r.status === "aborted" ? "text-destructive"
                      : "text-muted-foreground"
                    }`}>
                      {r.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString("id-ID")}
                    {r.username && <> · op: {r.username}</>}
                  </div>
                </button>
                {running && (
                  <button
                    onClick={() => void handleAbort(r.id)}
                    disabled={stoppingId === r.id}
                    title="Hentikan sesi"
                    className="flex items-center gap-1 px-2 py-1 rounded-sm border border-destructive/50 text-destructive hover:bg-destructive/10 font-mono uppercase text-[10px] tracking-wider disabled:opacity-40"
                  >
                    {stoppingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                    Stop
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
