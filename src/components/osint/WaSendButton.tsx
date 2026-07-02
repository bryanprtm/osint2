import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { buildWaLink, loadWaConfig, type WaConfig } from "@/lib/whatsapp";

export function WaSendButton({
  featureId,
  query,
  className = "",
  compact = false,
}: {
  featureId: string;
  query: string;
  className?: string;
  compact?: boolean;
}) {
  const [cfg, setCfg] = useState<WaConfig | null>(null);

  useEffect(() => {
    setCfg(loadWaConfig());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "jcd_wa_bot_cfg_v1") setCfg(loadWaConfig());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!cfg) return null;
  const link = buildWaLink(cfg, featureId, query);
  if (!link) return null;

  const base =
    "flex items-center justify-center gap-2 rounded-sm border transition-colors font-mono uppercase tracking-wider " +
    "border-success/50 text-success hover:bg-success/10";
  const size = compact ? "px-2.5 py-1 text-[10px]" : "w-full py-2 text-xs";

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Buka WhatsApp: ${link.text}`}
      className={`${base} ${size} ${className}`}
    >
      <MessageCircle className="w-3.5 h-3.5" />
      {compact ? "WA" : "Kirim ke Bot WhatsApp"}
    </a>
  );
}
