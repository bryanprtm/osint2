import { useEffect, useState } from "react";
import { MessageCircle, Loader2, Check, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getWaSettings, sendWaLookup, type WaSettingsPublic } from "@/lib/wa-gateway.functions";
import { useAuth } from "@/lib/auth";

export function WaAutoSend({ featureId, query }: { featureId: string; query: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<WaSettingsPublic | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useServerFn(getWaSettings);
  const send = useServerFn(sendWaLookup);

  useEffect(() => {
    void load().then((r) => setSettings(r?.settings ?? null)).catch(() => setSettings(null));
  }, [load]);

  if (!settings) return null;
  const cmd = settings.commands?.[featureId]?.trim();
  const ready = settings.enabled && settings.bot_number && settings.has_token && !!cmd;
  if (!ready) return null;

  const handle = async () => {
    if (!query.trim()) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await send({ data: { featureId, query, username: user?.username } });
      setMsg({ ok: !!r?.ok, text: r?.message ?? "" });
      setTimeout(() => setMsg(null), 4000);
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
        disabled={sending || !query.trim()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-success/50 text-success hover:bg-success/10 transition-colors font-mono uppercase tracking-wider text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        title={`Kirim "${cmd}${query}" ke ${settings.bot_number}`}
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
        {sending ? "Mengirim..." : "Kirim ke Bot WhatsApp"}
      </button>
      {msg && (
        <div className={`flex items-start gap-1.5 text-[10px] font-mono px-2 py-1 rounded-sm ${msg.ok ? "text-success bg-success/10 border border-success/30" : "text-destructive bg-destructive/10 border border-destructive/30"}`}>
          {msg.ok ? <Check className="w-3 h-3 mt-0.5 shrink-0" /> : <X className="w-3 h-3 mt-0.5 shrink-0" />}
          <span className="break-words">{msg.text}</span>
        </div>
      )}
    </div>
  );
}
