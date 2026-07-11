import { useEffect, useRef, useState } from "react";
import { MessageCircle, Loader2, Check, X, MessagesSquare, Lock, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getWaSettings, sendWaLookup, getWaReply, getWaPending, type WaSettingsPublic } from "@/lib/wa-gateway.functions";
import { hasActiveAnalysis } from "@/lib/analisa-ai.functions";
import { sendTgLookup, isEnigmaFeature, resolveEnigmaLabel } from "@/lib/tg-bridge.functions";
import { useAuth } from "@/lib/auth";
import { WaHistory } from "@/components/osint/WaHistory";



const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 300_000; // 5 menit

export function WaAutoSend({ featureId, query }: { featureId: string; query: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<WaSettingsPublic | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [waitingReply, setWaitingReply] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [pending, setPending] = useState<{ logId: string; featureId: string; query: string; command: string; created_at: string } | null>(null);
  const [analysis, setAnalysis] = useState<{ active: boolean; phone: string | null; created_at: string | null }>({ active: false, phone: null, created_at: null });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useServerFn(getWaSettings);
  const send = useServerFn(sendWaLookup);
  const sendTg = useServerFn(sendTgLookup);
  const fetchReply = useServerFn(getWaReply);
  const fetchPending = useServerFn(getWaPending);
  const fetchActiveAnalysis = useServerFn(hasActiveAnalysis);

  const isEnigma = isEnigmaFeature(featureId);
  const enigmaLabel = resolveEnigmaLabel(featureId) ?? "";

  useEffect(() => {
    if (isEnigma) { setSettings(null); return; }
    void load().then((r) => setSettings(r?.settings ?? null)).catch(() => setSettings(null));
  }, [load, isEnigma]);

  // Cek lock global: apakah ada permintaan lain yang belum dibalas bot
  useEffect(() => {
    if (!user?.username) return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetchPending({ data: { username: user.username } });
        if (cancelled) return;
        setPending(r?.pending ? { logId: r.logId, featureId: r.featureId, query: r.query, command: r.command, created_at: r.created_at } : null);
      } catch { /* ignore */ }
    };
    void check();
    pendingRef.current = setInterval(check, 4000);
    return () => {
      cancelled = true;
      if (pendingRef.current) { clearInterval(pendingRef.current); pendingRef.current = null; }
    };
  }, [fetchPending, user?.username, historyKey]);


  // Reset saat query berubah (user cari data lain)
  useEffect(() => {
    stopPolling();
    setReply(null);
    setLogId(null);
    setMsg(null);
    setWaitingReply(false);
    setWaitElapsed(0);
  }, [query, featureId]);

  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  function startPolling(id: string) {
    stopPolling();
    setWaitingReply(true);
    setWaitElapsed(0);
    const startedAt = Date.now();

    pollRef.current = setInterval(async () => {
      setWaitElapsed(Math.floor((Date.now() - startedAt) / 1000));
      try {
        const r = await fetchReply({ data: { logId: id } });
        if (r?.found && r.reply) {
          setReply(r.reply);
          setWaitingReply(false);
          setHistoryKey((k) => k + 1);
          stopPolling();
        }
      } catch {
        /* keep polling */
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setWaitingReply(false);
    }, POLL_TIMEOUT_MS);
  }

  // Enigma bot pakai bridge Telegram (selalu tersedia jika secret terkonfigurasi di server).
  // Modul non-enigma mengikuti gating dari wa_gateway_settings (Fonnte/Wablas).
  let cmd = "";
  let botLabel = "";
  if (isEnigma) {
    cmd = enigmaLabel;
    botLabel = "@enigmatoolsbot";
  } else {
    if (!settings) return null;
    cmd = settings.commands?.[featureId]?.trim() ?? "";
    const ready = settings.enabled && settings.bot_number && settings.has_token && !!cmd;
    if (!ready) return null;
    botLabel = settings.bot_number;
  }

  const handle = async () => {
    if (!query.trim()) return;
    setSending(true);
    setMsg(null);
    setReply(null);
    setLogId(null);
    try {
      const r = isEnigma
        ? await sendTg({ data: { featureId, query, username: user?.username } })
        : await send({ data: { featureId, query, username: user?.username } });
      setMsg({ ok: !!r?.ok, text: r?.message ?? "" });
      if (r?.ok && r.logId) {
        setLogId(r.logId);
        setHistoryKey((k) => k + 1);
        startPolling(r.logId);
      }
      if (!r?.ok) setTimeout(() => setMsg(null), 5000);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  // Lock jika ada pending milik user (di modul manapun), kecuali pending itu milik pengiriman kita sendiri
  const locked = !!pending && pending.logId !== logId;
  const lockAgeSec = pending ? Math.max(0, Math.floor((Date.now() - new Date(pending.created_at).getTime()) / 1000)) : 0;

  const btnLabel = isEnigma ? "Kirim ke Bot Enigma (Telegram)" : "Kirim ke Bot WhatsApp";
  const BtnIcon = isEnigma ? Send : MessageCircle;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handle}
        disabled={sending || waitingReply || locked || !query.trim()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-success/50 text-success hover:bg-success/10 transition-colors font-mono uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        title={locked ? `Menunggu balasan bot untuk "${pending!.command}"` : `Kirim "${cmd} ${query}" ke ${botLabel}`}
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : locked ? <Lock className="w-3.5 h-3.5" /> : <BtnIcon className="w-3.5 h-3.5" />}
        {sending
          ? "Mengirim..."
          : waitingReply
            ? `Menunggu balasan bot... (${waitElapsed}s)`
            : locked
              ? `Terkunci — tunggu balasan bot (${lockAgeSec}s)`
              : btnLabel}
      </button>

      {locked && (
        <div className="text-[10px] font-mono text-warning bg-warning/10 border border-warning/30 px-2 py-1 rounded-sm">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 shrink-0" />
            <span className="break-words">
              Ada permintaan sebelumnya yang masih menunggu balasan bot: <b>{pending!.command}</b>. Tombol kirim dinonaktifkan sampai balasan diterima atau timeout 5 menit tercapai.
            </span>
          </div>
        </div>
      )}

      {msg && !reply && (
        <div className={`flex items-start gap-1.5 text-[10px] font-mono px-2 py-1 rounded-sm ${msg.ok ? "text-success bg-success/10 border border-success/30" : "text-destructive bg-destructive/10 border border-destructive/30"}`}>
          {msg.ok ? <Check className="w-3 h-3 mt-0.5 shrink-0" /> : <X className="w-3 h-3 mt-0.5 shrink-0" />}
          <span className="break-words">{msg.text}</span>
        </div>
      )}

      {waitingReply && (
        <div className="text-[10px] font-mono text-muted-foreground px-2 py-1 border border-border/50 rounded-sm">
          Bot sedang memproses perintah. Balasan akan muncul otomatis di sini bila webhook sudah aktif di dashboard gateway.
        </div>
      )}


      {reply && (
        <div className="border border-primary/40 bg-primary/5 rounded-sm">
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-primary/30 text-[10px] font-mono uppercase tracking-wider text-primary">
            <MessagesSquare className="w-3 h-3" />
            Balasan Bot WhatsApp
          </div>
          <pre className="p-2 text-xs font-mono whitespace-pre-wrap break-words text-foreground max-h-96 overflow-auto">
            {reply}
          </pre>
        </div>
      )}

      {logId && !waitingReply && !reply && msg?.ok && (
        <div className="text-[10px] font-mono text-warning px-2 py-1 border border-warning/30 rounded-sm">
          Belum menerima balasan setelah 5 menit. Cek WhatsApp Anda langsung, atau pastikan webhook incoming sudah dikonfigurasi di dashboard gateway.
        </div>
      )}

      <WaHistory featureId={featureId} refreshKey={historyKey} />
    </div>
  );
}
