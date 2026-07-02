// WhatsApp bot deep-link integration.
// Stored client-side (localStorage) — this is a UX helper, no server calls.

const KEY = "jcd_wa_bot_cfg_v1";

export type WaConfig = {
  enabled: boolean;
  phone: string; // digits only, e.g. "6281234567890"
  /** Map feature.id -> command prefix, e.g. "nik" -> "/nikdetail" */
  commands: Record<string, string>;
};

export const DEFAULT_WA_COMMANDS: Record<string, string> = {
  nik: "/nikdetail",
  kk: "/kkdetail",
  nama: "/nama",
  bpjs: "/bpjs",
  nopol: "/plat",
  noka: "/noka",
  nosin: "/nosin",
  regnik: "/regnik",
  regphone: "/regphone",
  nik2photo: "/nik2foto",
  imei: "/imei",
  mahasiswa: "/mhs",
  guru: "/guru",
  "phone-doxing": "/hp",
  "whois-lookup": "/whois",
  "dns-lookup": "/dns",
};

export const DEFAULT_WA_CONFIG: WaConfig = {
  enabled: false,
  phone: "",
  commands: { ...DEFAULT_WA_COMMANDS },
};

export function loadWaConfig(): WaConfig {
  if (typeof window === "undefined") return DEFAULT_WA_CONFIG;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WA_CONFIG;
    const parsed = JSON.parse(raw) as Partial<WaConfig>;
    return {
      enabled: !!parsed.enabled,
      phone: sanitizePhone(parsed.phone ?? ""),
      commands: { ...DEFAULT_WA_COMMANDS, ...(parsed.commands ?? {}) },
    };
  } catch {
    return DEFAULT_WA_CONFIG;
  }
}

export function saveWaConfig(cfg: WaConfig) {
  if (typeof window === "undefined") return;
  const clean: WaConfig = {
    enabled: !!cfg.enabled,
    phone: sanitizePhone(cfg.phone),
    commands: cfg.commands,
  };
  localStorage.setItem(KEY, JSON.stringify(clean));
}

export function sanitizePhone(v: string): string {
  return (v || "").replace(/\D+/g, "");
}

function sanitizeQuery(featureId: string, q: string): string {
  const digitOnly = new Set(["nik", "kk", "bpjs", "imei", "regnik", "nik2photo"]);
  if (digitOnly.has(featureId)) return q.replace(/\D+/g, "");
  if (featureId === "regphone") return q.replace(/\D+/g, "");
  return q.trim();
}

export type WaLink = { url: string; text: string };

/**
 * Build a wa.me / api.whatsapp.com deep link with a pre-filled bot command.
 * Returns null if WA integration is off, phone is missing, mapping is missing,
 * or query is empty.
 */
export function buildWaLink(
  cfg: WaConfig,
  featureId: string,
  query: string,
): WaLink | null {
  if (!cfg.enabled) return null;
  const phone = sanitizePhone(cfg.phone);
  if (!phone) return null;
  const cmd = (cfg.commands[featureId] || "").trim();
  if (!cmd) return null;
  const q = sanitizeQuery(featureId, query);
  if (!q) return null;

  // Bot format: /command<value> (no space), e.g. /nikdetail3275110203970007
  const text = `${cmd}${q}`;

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const base = isMobile
    ? "https://api.whatsapp.com/send"
    : "https://wa.me/" + phone;
  const url = isMobile
    ? `${base}?phone=${phone}&text=${encodeURIComponent(text)}`
    : `${base}?text=${encodeURIComponent(text)}`;

  return { url, text };
}
