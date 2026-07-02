import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type WaProvider = "fonnte" | "wablas";

export type WaSettingsPublic = {
  provider: WaProvider;
  bot_number: string;
  subdomain: string;
  enabled: boolean;
  commands: Record<string, string>;
  has_token: boolean;
  has_secret: boolean;
  updated_at: string;
};

export type WaSendLogRow = {
  id: string;
  username: string | null;
  feature_id: string;
  query: string;
  command_sent: string;
  status: string;
  provider: string;
  provider_response: string | null;
  error: string | null;
  created_at: string;
};

export const DEFAULT_WA_COMMANDS: Record<string, string> = {
  nik: "/nikdetail",
  kk: "/kkdetail",
  nama: "/nama",
  bpjs: "/bpjs",
  nopol: "/plat",
  imei: "/imei",
  mahasiswa: "/mhs",
  guru: "/guru",
};

function sanitizePhone(v: string): string {
  return (v || "").replace(/\D+/g, "");
}

function sanitizeQuery(featureId: string, q: string): string {
  const digitOnly = new Set(["nik", "kk", "bpjs", "imei", "regnik", "nik2photo", "regphone"]);
  if (digitOnly.has(featureId)) return q.replace(/\D+/g, "");
  return q.trim();
}

async function loadRow() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("wa_gateway_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    await supabaseAdmin.from("wa_gateway_settings").insert({ id: 1 });
    const { data: d2 } = await supabaseAdmin.from("wa_gateway_settings").select("*").eq("id", 1).single();
    return d2 as any;
  }
  return data as any;
}

function toPublic(row: any): WaSettingsPublic {
  return {
    provider: (row.provider as WaProvider) ?? "fonnte",
    bot_number: row.bot_number ?? "",
    subdomain: row.subdomain ?? "",
    enabled: !!row.enabled,
    commands: (row.commands as Record<string, string>) ?? {},
    has_token: !!(row.api_token && String(row.api_token).length > 0),
    has_secret: !!(row.secret_key && String(row.secret_key).length > 0),
    updated_at: row.updated_at,
  };
}

// ============= READ =============
export const getWaSettings = createServerFn({ method: "GET" }).handler(async () => {
  const row = await loadRow();
  return { settings: toPublic(row) };
});

// ============= SAVE =============
export const saveWaSettings = createServerFn({ method: "POST" })
  .inputValidator((input: {
    provider: WaProvider;
    bot_number: string;
    subdomain?: string;
    enabled: boolean;
    commands: Record<string, string>;
    api_token?: string; // optional — empty string keeps existing
    secret_key?: string; // optional — empty string keeps existing
  }) =>
    z.object({
      provider: z.enum(["fonnte", "wablas"]),
      bot_number: z.string().max(30),
      subdomain: z.string().max(60).optional(),
      enabled: z.boolean(),
      commands: z.record(z.string(), z.string().max(60)),
      api_token: z.string().max(500).optional(),
      secret_key: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      provider: string;
      bot_number: string;
      subdomain: string;
      enabled: boolean;
      commands: Record<string, string>;
      updated_at: string;
      api_token?: string;
      secret_key?: string;
    } = {
      provider: data.provider,
      bot_number: sanitizePhone(data.bot_number),
      subdomain: (data.subdomain ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
      enabled: data.enabled,
      commands: data.commands,
      updated_at: new Date().toISOString(),
    };
    if (typeof data.api_token === "string" && data.api_token.trim().length > 0) {
      patch.api_token = data.api_token.trim();
    }
    if (typeof data.secret_key === "string" && data.secret_key.trim().length > 0) {
      patch.secret_key = data.secret_key.trim();
    }
    const { error } = await supabaseAdmin.from("wa_gateway_settings").update(patch).eq("id", 1);
    if (error) return { ok: false as const, error: error.message };
    const row = await loadRow();
    return { ok: true as const, settings: toPublic(row) };
  });

// ============= SEND =============
async function sendViaFonnte(token: string, target: string, message: string) {
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ target, message, countryCode: "62" }).toString(),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function sendViaWablas(token: string, target: string, message: string) {
  // Wablas: POST https://<subdomain>.wablas.com/api/send-message with Authorization: <token>
  // We default to the common "solo" subdomain; users can encode subdomain into token as "sub|token".
  let sub = "solo";
  let realToken = token;
  if (token.includes("|")) {
    const [s, t] = token.split("|");
    if (s) sub = s.trim();
    if (t) realToken = t.trim();
  }
  const res = await fetch(`https://${sub}.wablas.com/api/send-message`, {
    method: "POST",
    headers: { Authorization: realToken, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ phone: target, message }).toString(),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export const sendWaLookup = createServerFn({ method: "POST" })
  .inputValidator((input: {
    featureId: string;
    query: string;
    username?: string;
  }) =>
    z.object({
      featureId: z.string().min(1).max(80),
      query: z.string().min(1).max(200),
      username: z.string().max(80).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadRow();
    if (!row.enabled) return { ok: false as const, message: "Integrasi WhatsApp belum diaktifkan admin." };
    const target = sanitizePhone(row.bot_number);
    if (!target) return { ok: false as const, message: "Nomor bot belum dikonfigurasi." };
    if (!row.api_token) return { ok: false as const, message: "Token API gateway belum diisi." };

    const cmd = ((row.commands as Record<string, string>) || {})[data.featureId];
    if (!cmd || !cmd.trim()) return { ok: false as const, message: "Perintah untuk modul ini belum diatur." };

    const q = sanitizeQuery(data.featureId, data.query);
    if (!q) return { ok: false as const, message: "Query kosong." };

    const message = `${cmd.trim()}${q}`;
    const provider = row.provider as WaProvider;

    let result: { ok: boolean; status: number; text: string };
    try {
      result = provider === "wablas"
        ? await sendViaWablas(row.api_token, target, message)
        : await sendViaFonnte(row.api_token, target, message);
    } catch (e) {
      const errMsg = (e as Error).message;
      await supabaseAdmin.from("wa_send_log").insert({
        username: data.username ?? null,
        feature_id: data.featureId, query: q, command_sent: message,
        status: "failed", provider, error: errMsg,
      });
      return { ok: false as const, message: `Gagal menghubungi gateway: ${errMsg}` };
    }

    const success = result.ok && !/error|invalid|failed/i.test(result.text.slice(0, 200));
    await supabaseAdmin.from("wa_send_log").insert({
      username: data.username ?? null,
      feature_id: data.featureId, query: q, command_sent: message,
      status: success ? "sent" : "failed",
      provider,
      provider_response: result.text.slice(0, 2000),
      error: success ? null : `HTTP ${result.status}`,
    });

    return success
      ? { ok: true as const, message: `Perintah "${message}" terkirim ke ${target}.` }
      : { ok: false as const, message: `Gateway menolak (HTTP ${result.status}): ${result.text.slice(0, 200)}` };
  });

// ============= LIST LOG =============
export const listWaSendLog = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number } | undefined) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("wa_send_log")
      .select("id, username, feature_id, query, command_sent, status, provider, provider_response, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as WaSendLogRow[] };
  });
