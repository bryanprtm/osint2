import { useEffect, useState } from "react";
import type { Feature } from "@/lib/osint-data";
import { Cpu, Search, Loader2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getBpjsCaptcha } from "@/lib/lookup.functions";
import { WaAutoSend } from "@/components/osint/WaAutoSend";


export function BpjsConsole({
  feature,
  onSubmit,
  loading,
}: {
  feature: Feature;
  onSubmit: (payload: { nik: string; captcha: string; sessionId: string }) => void;
  loading: boolean;
}) {
  const [nik, setNik] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [captchaImg, setCaptchaImg] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [captchaError, setCaptchaError] = useState<string>("");
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const fetchCaptcha = useServerFn(getBpjsCaptcha);

  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    setCaptchaError("");
    setCaptchaText("");
    try {
      const r = await fetchCaptcha();
      const safe = r ?? { ok: false, message: "Tidak ada respons" };
      if (!safe.ok || !safe.captcha) {
        setCaptchaError(safe.message || "Gagal memuat captcha");
        setCaptchaImg("");
        setSessionId("");
        return;
      }
      setCaptchaImg(safe.captcha);
      setSessionId(safe.sessionId || "");
    } catch (e) {
      setCaptchaError((e as Error).message);
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    void loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nik.trim() || !captchaText.trim()) return;
        onSubmit({ nik: nik.trim(), captcha: captchaText.trim(), sessionId });
      }}
      className="panel-frame corner-brackets rounded-sm p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-cyber">
        <Cpu className="w-4 h-4" />
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-glow">BPJS SIPP · Captcha Verify</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{feature.code}</span>
      </div>

      <div className="border border-cyber/40 bg-input/40 px-3 py-2.5 rounded-sm">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Modul Aktif</div>
        <div className="text-sm font-semibold text-cyber text-glow">{feature.name}</div>
      </div>

      <div className="border border-border bg-input/40 px-3 py-2 rounded-sm">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
          NIK Target (16 digit)
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyber font-mono">›</span>
          <input
            autoFocus
            value={nik}
            onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
            placeholder="3275110203970007"
            className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground/50"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="border border-border bg-input/40 px-3 py-2 rounded-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Captcha</div>
          <button
            type="button"
            onClick={loadCaptcha}
            disabled={loadingCaptcha}
            className="flex items-center gap-1 text-[10px] font-mono text-cyber hover:underline disabled:opacity-50"
          >
            {loadingCaptcha ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            MUAT ULANG
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-32 h-14 flex items-center justify-center border border-cyber/30 bg-background/40 rounded-sm overflow-hidden">
            {loadingCaptcha ? (
              <Loader2 className="w-4 h-4 animate-spin text-cyber" />
            ) : captchaImg ? (
              <img src={captchaImg} alt="captcha" className="max-h-full max-w-full" />
            ) : (
              <span className="text-[9px] font-mono text-destructive px-1 text-center">{captchaError || "—"}</span>
            )}
          </div>
          <input
            value={captchaText}
            onChange={(e) => setCaptchaText(e.target.value)}
            placeholder="Ketik captcha"
            className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground/50 border-b border-cyber/40 pb-1"
          />
        </div>
        {sessionId && (
          <div className="text-[9px] font-mono text-muted-foreground truncate">SESSION: {sessionId}</div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || loadingCaptcha || !nik.trim() || !captchaText.trim() || !captchaImg}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm
          bg-cyber text-primary-foreground font-semibold tracking-wider text-sm
          hover:bg-cyber-glow transition-colors disabled:opacity-40 disabled:cursor-not-allowed
          glow-cyber uppercase"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {loading ? "Memverifikasi..." : "Verifikasi BPJS"}
      </button>

      <WaAutoSend featureId={feature.id} query={nik} />
    </form>
  );
}

