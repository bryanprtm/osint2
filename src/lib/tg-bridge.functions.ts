import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "crypto";

/**
 * Peta feature_id → teks tombol PERSIS di menu bot @enigmatoolsbot.
 * Harus identik dengan telegram-bridge/features.json.
 */
export const ENIGMA_FEATURES: Record<string, string> = {
  // NIK variants
  nik: "🆔 Cek NIK",
  nikdetail: "🆔 Cek NIK",
  nik_detail: "🆔 Cek NIK",
  cek_nik: "🆔 Cek NIK",
  ceknik: "🆔 Cek NIK",
  // KK variants
  kk: "👨‍👩‍👦 Cek KK",
  kkdetail: "👨‍👩‍👦 Cek KK",
  kk_detail: "👨‍👩‍👦 Cek KK",
  cek_kk: "👨‍👩‍👦 Cek KK",
  cekkk: "👨‍👩‍👦 Cek KK",
  // Nama
  nama: "🔍 Cek Nama",
  name: "🔍 Cek Nama",
  cek_nama: "🔍 Cek Nama",
  ceknama: "🔍 Cek Nama",
  // Data / Nomor umum
  cek_data: "🔍 Cek Data",
  cek_nomor: "📞 Cek Nomor",
  ceknomor: "📞 Cek Nomor",
  // Rek / Ewallet
  validasi_rek: "🔍 Validasi Rek/Ewallet",
  // NIK Photo
  nik_photo: "📸 NIK Photo",
  nik_photo_v2: "📸 NIK Photo V2",
  nik2photo: "📸 NIK Photo",
  // BPJS
  bpjs: "🏥 Cek BPJS",
  nkes: "🏥 Cek BPJS",
  bpjs_keluarga: "🏥 Cek BPJS Keluarga",
  bpjs_tk: "💼 Cek BPJS TK",
  // Mahasiswa
  mahasiswa: "👨‍🎓 Cek Mahasiswa",
  mhs: "👨‍🎓 Cek Mahasiswa",
  // Kendaraan
  kendaraan: "🚗 Cek Kendaraan",
  nopol: "🚗 Cek Kendaraan",
  plat: "🚗 Cek Kendaraan",
  // Lainnya
  face: "👤 Face Recognition",
  sim_reg: "📱 SIM REG",
  cp: "📱 SIM REG",
  msisdn: "📱 SIM REG",
  regnik: "📱 SIM REG",
  regphone: "📱 SIM REG",
  dpo: "🕵️ DPO",
  perusahaan: "🏢 Perusahaan",
};

// Normalisasi id: lowercase, samakan pemisah agar "Cek-NIK" / "CEK_NIK" / "cekNik" cocok.
function normalizeFeatureId(id: string): string {
  return String(id ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const ENIGMA_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(ENIGMA_FEATURES).map(([k, v]) => [normalizeFeatureId(k), v]),
);

export function resolveEnigmaLabel(featureId: string): string | null {
  return ENIGMA_LOOKUP[normalizeFeatureId(featureId)] ?? null;
}

export const ENIGMA_FEATURE_IDS = new Set(Object.keys(ENIGMA_LOOKUP));

export function isEnigmaFeature(featureId: string): boolean {
  return resolveEnigmaLabel(featureId) !== null;
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

type BridgeMode = "auto" | "mtproto" | "web";

function getBridgeMode(): BridgeMode {
  const m = (process.env.TG_BRIDGE_MODE ?? "auto").toLowerCase();
  return (m === "web" || m === "mtproto" ? m : "auto") as BridgeMode;
}

async function probeHealth(url: string) {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { method: "GET" });
    const j = (await res.json().catch(() => ({}))) as any;
    return { ok: res.ok, ...j };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const getTgBridgeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const mtUrl = process.env.TG_BRIDGE_URL ?? "";
  const webUrl = process.env.TG_BRIDGE_URL_WEB ?? "";
  const secret = process.env.TG_BRIDGE_SECRET ?? "";
  const mode = getBridgeMode();
  if (!secret || (!mtUrl && !webUrl)) return { configured: false as const, mode };
  const [mt, web] = await Promise.all([
    mtUrl ? probeHealth(mtUrl) : Promise.resolve(null),
    webUrl ? probeHealth(webUrl) : Promise.resolve(null),
  ]);
  return { configured: true as const, mode, mtproto: mt, web };
});

async function callBridge(url: string, secret: string, payload: object) {
  const body = JSON.stringify(payload);
  const signature = sign(secret, body);
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Signature": signature },
      body,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: `fetch error: ${(e as Error).message}` };
  }
}

export const sendTgLookup = createServerFn({ method: "POST" })
  .inputValidator((input: { featureId: string; query: string; username?: string }) =>
    z.object({
      featureId: z.string().min(1).max(80),
      query: z.string().min(1).max(200),
      username: z.string().max(80).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const label = ENIGMA_FEATURES[data.featureId];
    if (!label) return { ok: false as const, message: `Modul "${data.featureId}" bukan modul bot Enigma.` };

    const mtUrl = process.env.TG_BRIDGE_URL ?? "";
    const webUrl = process.env.TG_BRIDGE_URL_WEB ?? "";
    const secret = process.env.TG_BRIDGE_SECRET ?? "";
    const mode = getBridgeMode();
    if (!secret || (!mtUrl && !webUrl)) {
      return { ok: false as const, message: "Bridge Telegram belum dikonfigurasi (TG_BRIDGE_URL / TG_BRIDGE_URL_WEB / TG_BRIDGE_SECRET)." };
    }

    const q = data.query.trim();
    if (!q) return { ok: false as const, message: "Query kosong." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const commandSent = `${label} ${q}`;
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("wa_send_log")
      .insert({
        username: data.username ?? null,
        feature_id: data.featureId,
        query: q,
        command_sent: commandSent,
        status: "pending",
        provider: "telegram_bridge",
      })
      .select("id")
      .single();
    if (insErr || !inserted) return { ok: false as const, message: `Gagal buat log: ${insErr?.message ?? "unknown"}` };
    const logId = (inserted as any).id as string;

    // Susun urutan bridge yang dicoba sesuai mode.
    const targets: Array<{ name: "mtproto" | "web"; url: string }> = [];
    if (mode === "mtproto" && mtUrl) targets.push({ name: "mtproto", url: mtUrl });
    else if (mode === "web" && webUrl) targets.push({ name: "web", url: webUrl });
    else {
      if (mtUrl) targets.push({ name: "mtproto", url: mtUrl });
      if (webUrl) targets.push({ name: "web", url: webUrl });
    }

    const payload = { requestId: logId, feature: data.featureId, query: q };
    const attempts: string[] = [];
    let last: { ok: boolean; status: number; text: string } | null = null;
    let usedProvider: string | null = null;

    for (const t of targets) {
      const r = await callBridge(t.url, secret, payload);
      attempts.push(`${t.name}:${r.status}`);
      last = r;
      if (r.ok) { usedProvider = t.name; break; }
    }

    if (!last || !last.ok) {
      const msg = `Semua bridge gagal (${attempts.join(", ")}): ${last?.text.slice(0, 200) ?? "no response"}`;
      await supabaseAdmin.from("wa_send_log").update({ status: "failed", error: msg }).eq("id", logId);
      return { ok: false as const, message: msg, logId };
    }

    await supabaseAdmin.from("wa_send_log").update({
      status: "sent",
      provider: `telegram_bridge:${usedProvider}`,
      provider_response: last.text.slice(0, 2000),
    }).eq("id", logId);

    return { ok: true as const, message: `Perintah "${commandSent}" dikirim via ${usedProvider}. Menunggu balasan…`, logId, provider: usedProvider };
  });
