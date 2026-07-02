import { useEffect, useRef, useState } from "react";
import { MessageCircle, Loader2, Check, X, MessagesSquare } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getWaSettings, sendWaLookup, getWaReply, type WaSettingsPublic } from "@/lib/wa-gateway.functions";
import { useAuth } from "@/lib/auth";
import { WaHistory } from "@/components/osint/WaHistory";


const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 120_000; // 2 menit

export function WaAutoSend({ featureId, query }: { featureId: string; query: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<WaSettingsPublic | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [waitingReply, setWaitingReply] = useState(false);
  const [waitElapsed, setWaitElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useServerFn(getWaSettings);
  const send = useServerFn(sendWaLookup);
  const fetchReply = useServerFn(getWaReply);

  useEffect(() => {
    void load().then((r) => setSettings(r?.settings ?? null)).catch(() => setSettings(null));
  }, [load]);

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

  if (!settings) return null;
  const cmd = settings.commands?.[featureId]?.trim();
  const ready = settings.enabled && settings.bot_number && settings.has_token && !!cmd;
  if (!ready) return null;

  const handle = async () => {
    if (!query.trim()) return;
    setSending(true);
    setMsg(null);
    setReply(null);
    setLogId(null);
    try {
      const r = await send({ data: { featureId, query, username: user?.username } });
      setMsg({ ok: !!r?.ok, text: r?.message ?? "" });
      if (r?.ok && r.logId) {
        setLogId(r.logId);
        startPolling(r.logId);
      }
      if (!r?.ok) setTimeout(() => setMsg(null), 5000);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handle}
        disabled={sending || waitingReply || !query.trim()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-success/50 text-success hover:bg-success/10 transition-colors font-mono uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        title={`Kirim "${cmd}${query}" ke ${settings.bot_number}`}
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
        {sending ? "Mengirim..." : waitingReply ? `Menunggu balasan bot... (${waitElapsed}s)` : "Kirim ke Bot WhatsApp"}
      </button>

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
          Belum menerima balasan setelah 2 menit. Cek WhatsApp Anda langsung, atau pastikan webhook incoming sudah dikonfigurasi di dashboard gateway.
        </div>
      )}
    </div>
  );
}
