import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "crypto";

/**
 * Peta feature_id → teks tombol PERSIS di menu bot @enigmatoolsbot.
 * Harus identik dengan telegram-bridge/features.json.
 */
export const ENIGMA_FEATURES: Record<string, string> = {
  cek_data: "🔍 Cek Data",
  cek_nomor: "📞 Cek Nomor",
  nik: "🆔 Cek NIK",
  nama: "🔍 Cek Nama",
  kk: "👨‍👩‍👦 Cek KK",
  validasi_rek: "🔍 Validasi Rek/Ewallet",
  nik_photo: "📸 NIK Photo",
  nik_photo_v2: "📸 NIK Photo V2",
  bpjs_keluarga: "🏥 Cek BPJS Keluarga",
  bpjs: "🏥 Cek BPJS",
  bpjs_tk: "💼 Cek BPJS TK",
  mahasiswa: "👨‍🎓 Cek Mahasiswa",
  kendaraan: "🚗 Cek Kendaraan",
  face: "👤 Face Recognition",
  sim_reg: "📱 SIM REG",
  dpo: "🕵️ DPO",
  perusahaan: "🏢 Perusahaan",
};

export const ENIGMA_FEATURE_IDS = new Set(Object.keys(ENIGMA_FEATURES));

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export const getTgBridgeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.TG_BRIDGE_URL ?? "";
  const secret = process.env.TG_BRIDGE_SECRET ?? "";
  if (!url || !secret) return { configured: false as const };
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { method: "GET" });
    const j = (await res.json().catch(() => ({}))) as any;
    return { configured: true as const, ok: res.ok, bot: j?.bot ?? null, botId: j?.botId ?? null };
  } catch (e) {
    return { configured: true as const, ok: false, error: (e as Error).message };
  }
});

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

    const url = (process.env.TG_BRIDGE_URL ?? "").replace(/\/+$/, "");
    const secret = process.env.TG_BRIDGE_SECRET ?? "";
    if (!url || !secret) return { ok: false as const, message: "Bridge Telegram belum dikonfigurasi (TG_BRIDGE_URL / TG_BRIDGE_SECRET)." };

    const q = data.query.trim();
    if (!q) return { ok: false as const, message: "Query kosong." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Bikin log dulu → id-nya jadi requestId ke bridge.
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

    const body = JSON.stringify({ requestId: logId, feature: data.featureId, query: q });
    const signature = sign(secret, body);

    let result: { ok: boolean; status: number; text: string };
    try {
      const res = await fetch(`${url}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Signature": signature },
        body,
      });
      const text = await res.text();
      result = { ok: res.ok, status: res.status, text };
    } catch (e) {
      const errMsg = (e as Error).message;
      await supabaseAdmin.from("wa_send_log").update({ status: "failed", error: `bridge fetch: ${errMsg}` }).eq("id", logId);
      return { ok: false as const, message: `Gagal menghubungi bridge: ${errMsg}`, logId };
    }

    if (!result.ok) {
      await supabaseAdmin.from("wa_send_log").update({ status: "failed", error: `HTTP ${result.status}`, provider_response: result.text.slice(0, 2000) }).eq("id", logId);
      return { ok: false as const, message: `Bridge menolak (HTTP ${result.status}): ${result.text.slice(0, 200)}`, logId };
    }

    await supabaseAdmin.from("wa_send_log").update({ status: "sent", provider_response: result.text.slice(0, 2000) }).eq("id", logId);

    return { ok: true as const, message: `Perintah "${commandSent}" dikirim ke bot Enigma. Menunggu balasan…`, logId };
  });
